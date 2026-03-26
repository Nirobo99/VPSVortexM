const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CallParticipant = sequelize.define('CallParticipant', {
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'left_at'
    },
    isMuted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_muted'
    },
    isVideoOff: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_video_off'
    },
    isScreenSharing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_screen_sharing'
    },
    participantName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'participant_name'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional participant metadata'
    }
  }, {
    tableName: 'call_participants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['call_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['joined_at']
      },
      {
        unique: true,
        fields: ['call_id', 'user_id']
      }
    ]
  });

  // Associations
  CallParticipant.associate = (models) => {
    // CallParticipant belongs to Call
    CallParticipant.belongsTo(models.Call, {
      as: 'call',
      foreignKey: 'callId',
      onDelete: 'CASCADE'
    });

    // CallParticipant belongs to User
    CallParticipant.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId'
    });
  };

  // Instance methods
  CallParticipant.prototype.isActive = function() {
    return !this.leftAt;
  };

  CallParticipant.prototype.getParticipationDuration = function() {
    const endTime = this.leftAt || new Date();
    return Math.floor((endTime - this.joinedAt) / 1000); // Duration in seconds
  };

  // Class methods
  CallParticipant.getActiveParticipants = async function(callId) {
    return await CallParticipant.findAll({
      where: {
        callId,
        leftAt: null
      },
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'avatar', 'anonymous']
      }],
      order: [['joined_at', 'ASC']]
    });
  };

  CallParticipant.addParticipant = async function(callId, userId, options = {}) {
    const { participantName = null, metadata = null } = options;
    
    return await CallParticipant.findOrCreate({
      where: {
        callId,
        userId
      },
      defaults: {
        participantName,
        metadata
      }
    });
  };

  CallParticipant.removeParticipant = async function(callId, userId) {
    const participant = await CallParticipant.findOne({
      where: {
        callId,
        userId,
        leftAt: null
      }
    });

    if (participant) {
      participant.leftAt = new Date();
      await participant.save();
    }

    return participant;
  };

  CallParticipant.updateParticipantState = async function(callId, userId, state) {
    const participant = await CallParticipant.findOne({
      where: {
        callId,
        userId,
        leftAt: null
      }
    });

    if (participant) {
      if (state.isMuted !== undefined) participant.isMuted = state.isMuted;
      if (state.isVideoOff !== undefined) participant.isVideoOff = state.isVideoOff;
      if (state.isScreenSharing !== undefined) participant.isScreenSharing = state.isScreenSharing;
      if (state.participantName !== undefined) participant.participantName = state.participantName;
      
      await participant.save();
    }

    return participant;
  };

  return CallParticipant;
};
