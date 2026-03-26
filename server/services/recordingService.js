const { CallRecording } = require('../models');
const { livekitManager } = require('../utils/livekit');
const fs = require('fs').promises;
const path = require('path');

/**
 * Service for managing call recordings
 */
class RecordingService {
  constructor() {
    this.recordingsPath = path.join(__dirname, '../../uploads/recordings');
    this.ensureRecordingsDirectory();
  }

  /**
   * Ensure recordings directory exists
   */
  async ensureRecordingsDirectory() {
    try {
      await fs.mkdir(this.recordingsPath, { recursive: true });
    } catch (error) {
      console.error('Error creating recordings directory:', error);
    }
  }

  /**
   * Start recording for a call
   * @param {number} callId - Call ID
   * @param {string} roomName - LiveKit room name
   * @param {Object} options - Recording options
   */
  async startRecording(callId, roomName, options = {}) {
    try {
      const {
        notifyParticipants = true,
        autoStart = false,
        maxDuration = 3600 // 1 hour max
      } = options;

      // Check if recording already exists for this call
      const existingRecording = await CallRecording.findOne({
        where: { callId, status: 'processing' }
      });

      if (existingRecording) {
        throw new Error('Recording already in progress for this call');
      }

      // Create recording record
      const recording = await CallRecording.create({
        callId,
        url: null, // Will be updated when recording is ready
        filename: `recording_${roomName}_${Date.now()}.mp4`,
        size: null,
        duration: null,
        format: 'mp4',
        status: 'processing',
        storagePath: path.join(this.recordingsPath, `recording_${roomName}_${Date.now()}.mp4`)
      });

      // Start recording with LiveKit
      try {
        await livekitManager.startRecording(roomName, {
          outputPath: recording.storagePath,
          maxDuration
        });

        // Update call to indicate recording is enabled
        const { Call } = require('../models');
        const call = await Call.findByPk(callId);
        if (call) {
          call.recordingEnabled = true;
          await call.save();
        }

        return {
          success: true,
          recording: {
            id: recording.id,
            status: recording.status,
            startedAt: recording.startedAt
          }
        };

      } catch (livekitError) {
        // Mark recording as failed if LiveKit fails
        await CallRecording.markAsFailed(recording.id, livekitError);
        throw new Error(`Failed to start recording: ${livekitError.message}`);
      }

    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording for a call
   * @param {number} callId - Call ID
   * @param {string} roomName - LiveKit room name
   */
  async stopRecording(callId, roomName) {
    try {
      // Find active recording
      const recording = await CallRecording.findOne({
        where: { callId, status: 'processing' }
      });

      if (!recording) {
        throw new Error('No active recording found for this call');
      }

      // Stop recording with LiveKit
      try {
        await livekitManager.stopRecording(roomName);
      } catch (livekitError) {
        console.warn('Error stopping LiveKit recording:', livekitError.message);
      }

      // Get file info
      let fileInfo = { size: null, duration: null };
      try {
        const stats = await fs.stat(recording.storagePath);
        fileInfo.size = stats.size;
        
        // TODO: Get duration from video metadata (requires ffmpeg)
        fileInfo.duration = 0; // Placeholder
      } catch (fileError) {
        console.warn('Error getting recording file info:', fileError.message);
      }

      // Update recording record
      await CallRecording.markAsReady(recording.id, {
        url: `/uploads/recordings/${recording.filename}`,
        size: fileInfo.size,
        duration: fileInfo.duration
      });

      // Update call to indicate recording is disabled
      const { Call } = require('../models');
      const call = await Call.findByPk(callId);
      if (call) {
        call.recordingEnabled = false;
        call.recordingUrl = `/uploads/recordings/${recording.filename}`;
        await call.save();
      }

      return {
        success: true,
        recording: {
          id: recording.id,
          status: 'ready',
          url: call.recordingUrl,
          duration: fileInfo.duration
        }
      };

    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * Get recording status
   * @param {number} callId - Call ID
   */
  async getRecordingStatus(callId) {
    try {
      const recordings = await CallRecording.findAll({
        where: { callId },
        order: [['created_at', 'DESC']]
      });

      return {
        recordings: recordings.map(rec => ({
          id: rec.id,
          status: rec.status,
          url: rec.url,
          duration: rec.duration,
          size: rec.size,
          createdAt: rec.created_at,
          completedAt: rec.completed_at
        }))
      };

    } catch (error) {
      console.error('Error getting recording status:', error);
      throw error;
    }
  }

  /**
   * Delete recording
   * @param {number} recordingId - Recording ID
   */
  async deleteRecording(recordingId) {
    try {
      const recording = await CallRecording.findByPk(recordingId);
      
      if (!recording) {
        throw new Error('Recording not found');
      }

      // Delete file from storage
      if (recording.storagePath) {
        try {
          await fs.unlink(recording.storagePath);
        } catch (fileError) {
          console.warn('Error deleting recording file:', fileError.message);
        }
      }

      // Delete database record
      await recording.destroy();

      return { success: true };

    } catch (error) {
      console.error('Error deleting recording:', error);
      throw error;
    }
  }

  /**
   * Get user's recordings
   * @param {number} userId - User ID
   * @param {Object} options - Pagination options
   */
  async getUserRecordings(userId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      
      const result = await CallRecording.getReadyRecordingsForUser(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return result;

    } catch (error) {
      console.error('Error getting user recordings:', error);
      throw error;
    }
  }

  /**
   * Check if recording is allowed for call
   * @param {number} callId - Call ID
   * @param {number} userId - User ID (requesting recording)
   */
  async canRecordCall(callId, userId) {
    try {
      const { Call } = require('../models');
      const call = await Call.findByPk(callId);

      if (!call) {
        return { allowed: false, reason: 'Call not found' };
      }

      if (call.status !== 'active') {
        return { allowed: false, reason: 'Call is not active' };
      }

      // Only initiator can start recording (for now)
      if (call.initiatorId !== userId) {
        return { allowed: false, reason: 'Only call initiator can start recording' };
      }

      // Check if recording is already in progress
      const existingRecording = await CallRecording.findOne({
        where: { callId, status: 'processing' }
      });

      if (existingRecording) {
        return { allowed: false, reason: 'Recording already in progress' };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking recording permission:', error);
      return { allowed: false, reason: 'Internal error' };
    }
  }

  /**
   * Clean up old recordings (maintenance task)
   * @param {number} daysOld - Delete recordings older than this many days
   */
  async cleanupOldRecordings(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const oldRecordings = await CallRecording.findAll({
        where: {
          created_at: {
            [require('sequelize').Op.lt]: cutoffDate
          }
        }
      });

      let deletedCount = 0;
      for (const recording of oldRecordings) {
        try {
          await this.deleteRecording(recording.id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting recording ${recording.id}:`, error.message);
        }
      }

      console.log(`Cleaned up ${deletedCount} old recordings`);
      return { deletedCount };

    } catch (error) {
      console.error('Error cleaning up old recordings:', error);
      throw error;
    }
  }
}

// Export singleton instance
const recordingService = new RecordingService();

module.exports = {
  RecordingService,
  recordingService
};
