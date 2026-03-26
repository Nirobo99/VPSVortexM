const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Event = sequelize.define('Event', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    channelId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'channel_id',
      references: {
        model: 'channels',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'post_id',
      references: {
        model: 'posts',
        key: 'id'
      },
      comment: 'Associated post for this event'
    },
    organizerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organizer_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: [3, 200],
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('meeting', 'webinar', 'workshop', 'conference', 'party', 'sports', 'other'),
      defaultValue: 'meeting',
      comment: 'Event type'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Event category'
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_time',
      comment: 'Event start time'
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_time',
      comment: 'Event end time'
    },
    timezone: {
      type: DataTypes.STRING(50),
      defaultValue: 'UTC',
      comment: 'Event timezone'
    },
    location: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Location information (address, coordinates, online link)'
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_online',
      comment: 'Event is online/virtual'
    },
    meetingLink: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'meeting_link',
      comment: 'Online meeting link'
    },
    meetingId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'meeting_id',
      comment: 'Meeting ID for video calls'
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_participants',
      comment: 'Maximum number of participants'
    },
    currentParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'current_participants',
      comment: 'Current number of participants'
    },
    registrationRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'registration_required',
      comment: 'Registration is required'
    },
    registrationDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'registration_deadline',
      comment: 'Registration deadline'
    },
    registrationSettings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        requireApproval: false,
        allowWaitlist: true,
        collectInfo: ['name', 'email'],
        customFields: []
      },
      comment: 'Registration settings and custom fields'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Event price (0 = free)'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'RUB',
      comment: 'Currency code'
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Event images and cover'
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Event tags'
    },
    agenda: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Event agenda/schedule'
    },
    speakers: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Event speakers and presenters'
    },
    sponsors: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Event sponsors'
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'ongoing', 'completed', 'cancelled'),
      defaultValue: 'draft',
      comment: 'Event status'
    },
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'unlisted'),
      defaultValue: 'public',
      comment: 'Event visibility'
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_recurring',
      comment: 'Event is recurring'
    },
    recurrence: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Recurrence pattern (daily, weekly, monthly)'
    },
    reminders: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [
        { type: 'email', time: 60 }, // 60 minutes before
        { type: 'push', time: 15 }   // 15 minutes before
      ],
      comment: 'Event reminders'
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        allowComments: true,
        allowSharing: true,
        showParticipants: true,
        requireConfirmation: false
      },
      comment: 'Event-specific settings'
    },
    statistics: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        views: 0,
        registrations: 0,
        attendees: 0,
        noShows: 0
      },
      comment: 'Event statistics'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional event metadata'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['channel_id']
      },
      {
        fields: ['post_id']
      },
      {
        fields: ['organizer_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['category']
      },
      {
        fields: ['status']
      },
      {
        fields: ['visibility']
      },
      {
        fields: ['start_time']
      },
      {
        fields: ['end_time']
      },
      {
        fields: ['is_online']
      },
      {
        fields: ['registration_required']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Associations
  Event.associate = (models) => {
    // Event belongs to Channel
    Event.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Event belongs to Post
    Event.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId'
    });

    // Event belongs to Organizer
    Event.belongsTo(models.User, {
      as: 'organizer',
      foreignKey: 'organizerId'
    });

    // Event has many registrations
    Event.hasMany(models.EventRegistration, {
      as: 'registrations',
      foreignKey: 'eventId',
      onDelete: 'CASCADE'
    });

    // Event has many attendees
    Event.hasMany(models.EventAttendee, {
      as: 'attendees',
      foreignKey: 'eventId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Event.prototype.isUpcoming = function() {
    return new Date() < new Date(this.startTime);
  };

  Event.prototype.isOngoing = function() {
    const now = new Date();
    const start = new Date(this.startTime);
    const end = this.endTime ? new Date(this.endTime) : null;
    
    return now >= start && (!end || now <= end);
  };

  Event.prototype.isPast = function() {
    const end = this.endTime ? new Date(this.endTime) : new Date(this.startTime);
    return new Date() > end;
  };

  Event.prototype.canRegister = function() {
    if (!this.registrationRequired) return false;
    if (this.status !== 'published') return false;
    if (this.isPast()) return false;
    
    if (this.registrationDeadline) {
      return new Date() <= new Date(this.registrationDeadline);
    }
    
    return true;
  };

  Event.prototype.hasCapacity = function() {
    if (!this.maxParticipants) return true;
    return this.currentParticipants < this.maxParticipants;
  };

  Event.prototype.getAvailableSpots = function() {
    if (!this.maxParticipants) return null;
    return Math.max(0, this.maxParticipants - this.currentParticipants);
  };

  Event.prototype.getDuration = function() {
    if (!this.endTime) return null;
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);
    return Math.floor((end - start) / (1000 * 60)); // Duration in minutes
  };

  Event.prototype.updateParticipantCount = async function() {
    const { EventRegistration } = sequelize.models;
    
    const count = await EventRegistration.count({
      where: {
        eventId: this.id,
        status: 'confirmed'
      }
    });
    
    this.currentParticipants = count;
    await this.save();
  };

  Event.prototype.registerUser = async function(userId, registrationData = {}) {
    if (!this.canRegister()) {
      throw new Error('Registration is not open for this event');
    }

    if (!this.hasCapacity()) {
      throw new Error('Event is full');
    }

    const { EventRegistration } = sequelize.models;
    
    // Check if already registered
    const existingRegistration = await EventRegistration.findOne({
      where: {
        eventId: this.id,
        userId
      }
    });

    if (existingRegistration) {
      throw new Error('User is already registered for this event');
    }

    // Create registration
    const registration = await EventRegistration.create({
      eventId: this.id,
      userId,
      status: this.registrationSettings.requireApproval ? 'pending' : 'confirmed',
      registeredAt: new Date(),
      ...registrationData
    });

    // Update participant count if confirmed
    if (registration.status === 'confirmed') {
      await this.updateParticipantCount();
    }

    // Update statistics
    if (!this.statistics) this.statistics = {};
    this.statistics.registrations = (this.statistics.registrations || 0) + 1;
    await this.save();

    return registration;
  };

  Event.prototype.unregisterUser = async function(userId) {
    const { EventRegistration } = sequelize.models;
    
    const registration = await EventRegistration.findOne({
      where: {
        eventId: this.id,
        userId
      }
    });

    if (!registration) {
      throw new Error('User is not registered for this event');
    }

    await registration.destroy();

    // Update participant count
    await this.updateParticipantCount();

    return registration;
  };

  Event.prototype.publish = async function() {
    this.status = 'published';
    await this.save();

    // Update channel activity
    const channel = await sequelize.models.Channel.findByPk(this.channelId);
    if (channel) {
      await channel.updateLastActivity();
    }
  };

  Event.prototype.cancel = async function(reason = null) {
    this.status = 'cancelled';
    
    if (!this.metadata) this.metadata = {};
    this.metadata.cancelledAt = new Date();
    this.metadata.cancelReason = reason;
    
    await this.save();

    // Notify all registered users
    const { EventRegistration } = sequelize.models;
    const registrations = await EventRegistration.findAll({
      where: { eventId: this.id }
    });

    // TODO: Send cancellation notifications
    console.log(`Event ${this.id} cancelled. Notifying ${registrations.length} registered users.`);
  };

  Event.prototype.start = async function() {
    this.status = 'ongoing';
    await this.save();
  };

  Event.prototype.complete = async function() {
    this.status = 'completed';
    await this.save();

    // Update final statistics
    const { EventAttendee } = sequelize.models;
    const attendeeCount = await EventAttendee.count({
      where: { eventId: this.id }
    });

    if (!this.statistics) this.statistics = {};
    this.statistics.attendees = attendeeCount;
    this.statistics.completedAt = new Date();
    await this.save();
  };

  Event.prototype.incrementViews = async function() {
    if (!this.statistics) this.statistics = {};
    this.statistics.views = (this.statistics.views || 0) + 1;
    await this.save();
  };

  // Class methods
  Event.findChannelEvents = async function(channelId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = null,
      status = 'published',
      isOnline = null,
      startDate = null,
      endDate = null,
      sortBy = 'start_time',
      sortOrder = 'ASC'
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      channelId,
      status
    };

    if (type) {
      whereClause.type = type;
    }

    if (isOnline !== null) {
      whereClause.isOnline = isOnline;
    }

    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) {
        whereClause.startTime[sequelize.Sequelize.Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.startTime[sequelize.Sequelize.Op.lte] = new Date(endDate);
      }
    }

    const { count, rows } = await Event.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'organizer',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    return {
      events: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalEvents: count,
        limit
      }
    };
  };

  Event.findUpcomingEvents = async function(channelId = null, limit = 10) {
    const whereClause = {
      status: 'published',
      startTime: {
        [sequelize.Sequelize.Op.gt]: new Date()
      }
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    return await Event.findAll({
      where: whereClause,
      include: [
        {
          model: sequelize.models.User,
          as: 'organizer',
          attributes: ['id', 'name', 'username', 'avatar']
        }
      ],
      order: [['start_time', 'ASC']],
      limit
    });
  };

  Event.findUserEvents = async function(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      role = 'all', // 'organizer', 'registered', 'all'
      status = null
    } = options;

    const offset = (page - 1) * limit;
    
    let events = [];
    
    if (role === 'organizer' || role === 'all') {
      const organizedEvents = await Event.findAll({
        where: {
          organizerId: userId,
          ...(status && { status })
        },
        include: [
          {
            model: sequelize.models.Channel,
            as: 'channel',
            attributes: ['id', 'name', 'username', 'avatar']
          }
        ]
      });
      events = events.concat(organizedEvents);
    }

    if (role === 'registered' || role === 'all') {
      const { EventRegistration } = sequelize.models;
      const registrations = await EventRegistration.findAll({
        where: { userId },
        include: [
          {
            model: Event,
            as: 'event',
            include: [
              {
                model: sequelize.models.Channel,
                as: 'channel',
                attributes: ['id', 'name', 'username', 'avatar']
              }
            ]
          }
        ]
      });
      
      events = events.concat(registrations.map(reg => reg.event));
    }

    // Remove duplicates and paginate
    const uniqueEvents = events.filter((event, index, self) => 
      index === self.findIndex(e => e.id === event.id)
    );

    const totalEvents = uniqueEvents.length;
    const paginatedEvents = uniqueEvents.slice(offset, offset + limit);

    return {
      events: paginatedEvents,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEvents / limit),
        totalEvents,
        limit
      }
    };
  };

  // Hooks
  Event.afterCreate(async (event) => {
    // Update channel activity
    const channel = await sequelize.models.Channel.findByPk(event.channelId);
    if (channel) {
      await channel.updateLastActivity();
    }
  });

  return Event;
};
