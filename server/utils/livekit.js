const { AccessToken } = require('livekit-server-sdk');

/**
 * LiveKit utility functions for managing video calls
 */
class LiveKitManager {
  constructor() {
    this.host = process.env.LIVEKIT_HOST || 'http://localhost:7880';
    this.apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    this.apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
  }

  /**
   * Generate access token for LiveKit room
   * @param {string} roomName - Room identifier
   * @param {string} participantName - Participant identifier (usually userId)
   * @param {Object} options - Additional options
   * @returns {string} JWT token
   */
  generateToken(roomName, participantName, options = {}) {
    const {
      canPublish = true,
      canSubscribe = true,
      canPublishData = true,
      hidden = false,
      recorder = false
    } = options;

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantName,
      name: participantName,
      metadata: JSON.stringify(options.metadata || {})
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
      hidden,
      recorder
    });

    return at.toJwt();
  }

  /**
   * Generate unique room name for call
   * @param {string} type - 'audio' or 'video'
   * @param {number} initiatorId - User ID who initiated the call
   * @returns {string} Room name
   */
  generateRoomName(type, initiatorId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}_${initiatorId}_${timestamp}_${random}`;
  }

  /**
   * Create room via LiveKit API (optional)
   * @param {string} roomName - Room name
   * @param {Object} options - Room options
   */
  async createRoom(roomName, options = {}) {
    try {
      const response = await fetch(`${this.host}/rooms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.generateToken('admin', 'admin', { recorder: true })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: roomName,
          emptyTimeout: 300, // 5 minutes
          maxParticipants: options.maxParticipants || 100,
          enabledRecordings: options.recordings || false,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create room: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating LiveKit room:', error);
      throw error;
    }
  }

  /**
   * Delete room via LiveKit API
   * @param {string} roomName - Room name
   */
  async deleteRoom(roomName) {
    try {
      const response = await fetch(`${this.host}/rooms/${roomName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.generateToken('admin', 'admin', { recorder: true })}`
        }
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete room: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting LiveKit room:', error);
      throw error;
    }
  }

  /**
   * Get room participants
   * @param {string} roomName - Room name
   */
  async getRoomParticipants(roomName) {
    try {
      const response = await fetch(`${this.host}/rooms/${roomName}/participants`, {
        headers: {
          'Authorization': `Bearer ${this.generateToken('admin', 'admin', { recorder: true })}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get participants: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting room participants:', error);
      throw error;
    }
  }

  /**
   * Start recording for a room
   * @param {string} roomName - Room name
   * @param {Object} options - Recording options
   */
  async startRecording(roomName, options = {}) {
    try {
      const response = await fetch(`${this.host}/rooms/${roomName}/recording`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.generateToken('admin', 'admin', { recorder: true })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          outputFile: `recording_${roomName}_${Date.now()}.mp4`,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start recording: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording for a room
   * @param {string} roomName - Room name
   */
  async stopRecording(roomName) {
    try {
      const response = await fetch(`${this.host}/rooms/${roomName}/recording`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.generateToken('admin', 'admin', { recorder: true })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to stop recording: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * Validate LiveKit configuration
   */
  validateConfig() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('LiveKit API key and secret are required');
    }
    if (!this.host) {
      throw new Error('LiveKit host is required');
    }
    return true;
  }
}

// Export singleton instance
const livekitManager = new LiveKitManager();

module.exports = {
  LiveKitManager,
  livekitManager
};
