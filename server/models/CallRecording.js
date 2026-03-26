const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CallRecording = sequelize.define('CallRecording', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    callId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'call_id',
      references: {
        model: 'calls',
        key: 'id'
      }
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'URL to the recorded file'
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Original filename'
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'File size in bytes'
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Recording duration in seconds'
    },
    format: {
      type: DataTypes.ENUM('mp4', 'webm', 'mp3', 'wav'),
      defaultValue: 'mp4',
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('processing', 'ready', 'failed'),
      defaultValue: 'processing',
      allowNull: false
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'started_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    storagePath: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'storage_path',
      comment: 'Local storage path'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional recording metadata'
    }
  }, {
    tableName: 'call_recordings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['call_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  CallRecording.associate = (models) => {
    // CallRecording belongs to Call
    CallRecording.belongsTo(models.Call, {
      as: 'call',
      foreignKey: 'callId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  CallRecording.prototype.isReady = function() {
    return this.status === 'ready';
  };

  CallRecording.prototype.isProcessing = function() {
    return this.status === 'processing';
  };

  CallRecording.prototype.isFailed = function() {
    return this.status === 'failed';
  };

  CallRecording.prototype.getFormattedDuration = function() {
    if (!this.duration) return '00:00';
    
    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = this.duration % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  CallRecording.prototype.getFormattedSize = function() {
    if (!this.size) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.size;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Class methods
  CallRecording.createRecording = async function(callId, recordingData) {
    const {
      url,
      filename,
      size = null,
      duration = null,
      format = 'mp4',
      storagePath = null,
      metadata = null
    } = recordingData;

    return await CallRecording.create({
      callId,
      url,
      filename,
      size,
      duration,
      format,
      storagePath,
      metadata
    });
  };

  CallRecording.markAsReady = async function(recordingId, completionData = {}) {
    const recording = await CallRecording.findByPk(recordingId);
    
    if (recording) {
      recording.status = 'ready';
      recording.completedAt = new Date();
      
      if (completionData.url) recording.url = completionData.url;
      if (completionData.size !== undefined) recording.size = completionData.size;
      if (completionData.duration !== undefined) recording.duration = completionData.duration;
      if (completionData.storagePath) recording.storagePath = completionData.storagePath;
      
      await recording.save();
    }
    
    return recording;
  };

  CallRecording.markAsFailed = async function(recordingId, error = null) {
    const recording = await CallRecording.findByPk(recordingId);
    
    if (recording) {
      recording.status = 'failed';
      recording.completedAt = new Date();
      
      if (error) {
        recording.metadata = {
          ...recording.metadata,
          error: error.message || error
        };
      }
      
      await recording.save();
    }
    
    return recording;
  };

  CallRecording.getRecordingsForCall = async function(callId) {
    return await CallRecording.findAll({
      where: { callId },
      order: [['created_at', 'ASC']]
    });
  };

  CallRecording.getReadyRecordingsForUser = async function(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await CallRecording.findAndCountAll({
      where: {
        status: 'ready'
      },
      include: [{
        model: sequelize.models.Call,
        as: 'call',
        where: {
          [sequelize.Sequelize.Op.or]: [
            { initiatorId: userId },
            { targetId: userId }
          ]
        },
        include: [
          {
            model: sequelize.models.User,
            as: 'initiator',
            attributes: ['id', 'name', 'avatar']
          },
          {
            model: sequelize.models.User,
            as: 'target',
            attributes: ['id', 'name', 'avatar']
          }
        ]
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      recordings: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalRecordings: count,
        limit
      }
    };
  };

  return CallRecording;
};
