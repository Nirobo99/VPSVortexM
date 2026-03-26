const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Call = sequelize.define('Call', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    roomName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'room_name'
    },
    initiatorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'initiator_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('audio', 'video'),
      allowNull: false
    },
    isGroup: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_group'
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'ended', 'missed'),
      defaultValue: 'pending',
      allowNull: false
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'target_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'For direct calls - the target user. For group calls - null'
    },
    conversationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'conversation_id',
      references: {
        model: 'conversations',
        key: 'id'
      },
      comment: 'For group calls - the conversation. For direct calls - null'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at'
    },
    recordingEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'recording_enabled'
    },
    recordingUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'recording_url'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional call metadata'
    }
  }, {
    tableName: 'calls',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['initiator_id']
      },
      {
        fields: ['target_id']
      },
      {
        fields: ['conversation_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['room_name']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  Call.associate = (models) => {
    // Call belongs to initiator
    Call.belongsTo(models.User, {
      as: 'initiator',
      foreignKey: 'initiatorId'
    });

    // Call belongs to target (for direct calls)
    Call.belongsTo(models.User, {
      as: 'target',
      foreignKey: 'targetId'
    });

    // Call belongs to conversation (for group calls)
    Call.belongsTo(models.Conversation, {
      as: 'conversation',
      foreignKey: 'conversationId'
    });

    // Call has many participants
    Call.hasMany(models.CallParticipant, {
      as: 'participants',
      foreignKey: 'callId',
      onDelete: 'CASCADE'
    });

    // Call has many recordings
    Call.hasMany(models.CallRecording, {
      as: 'recordings',
      foreignKey: 'callId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Call.prototype.isActive = function() {
    return this.status === 'active';
  };

  Call.prototype.isEnded = function() {
    return ['ended', 'missed'].includes(this.status);
  };

  Call.prototype.getDuration = function() {
    if (!this.startedAt) return 0;
    const endTime = this.endedAt || new Date();
    return Math.floor((endTime - this.startedAt) / 1000); // Duration in seconds
  };

  // Class methods
  Call.findActiveCallsForUser = async function(userId) {
    return await Call.findAll({
      where: {
        status: 'active',
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
        },
        {
          model: sequelize.models.CallParticipant,
          as: 'participants',
          include: [{
            model: sequelize.models.User,
            as: 'user',
            attributes: ['id', 'name', 'avatar']
          }]
        }
      ]
    });
  };

  Call.findCallHistory = async function(userId, options = {}) {
    const { page = 1, limit = 20, type = null } = options;
    const offset = (page - 1) * limit;

    const whereClause = {
      [sequelize.Sequelize.Op.or]: [
        { initiatorId: userId },
        { targetId: userId }
      ]
    };

    if (type) {
      whereClause.type = type;
    }

    const { count, rows } = await Call.findAndCountAll({
      where: whereClause,
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
        },
        {
          model: sequelize.models.Conversation,
          as: 'conversation',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      calls: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalCalls: count,
        limit
      }
    };
  };

  return Call;
};
