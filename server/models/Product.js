const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Product = sequelize.define('Product', {
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
      comment: 'Associated post for this product'
    },
    name: {
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
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Product price'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'RUB',
      comment: 'Currency code (ISO 4217)'
    },
    originalPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'original_price',
      comment: 'Original price before discount'
    },
    discount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Discount percentage (0-100)'
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Product images URLs'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Product category'
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Product tags'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'Stock Keeping Unit'
    },
    barcode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Product barcode'
    },
    inventory: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Inventory information (stock, variants, etc.)'
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Available stock quantity'
    },
    stockStatus: {
      type: DataTypes.ENUM('in_stock', 'out_of_stock', 'pre_order', 'limited'),
      defaultValue: 'in_stock',
      field: 'stock_status',
      comment: 'Stock availability status'
    },
    weight: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      comment: 'Product weight (kg)'
    },
    dimensions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Product dimensions (length, width, height)'
    },
    shipping: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Shipping information and costs'
    },
    attributes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Product attributes (color, size, material, etc.)'
    },
    variants: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Product variants with different prices/options'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Product is active and available'
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_featured',
      comment: 'Product is featured/special'
    },
    isDigital: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_digital',
      comment: 'Digital product (no shipping)'
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'sold_out', 'discontinued', 'archived'),
      defaultValue: 'draft',
      comment: 'Product status'
    },
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'hidden'),
      defaultValue: 'public',
      comment: 'Product visibility'
    },
    seo: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'SEO metadata'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Additional product metadata'
    },
    statistics: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        views: 0,
        clicks: 0,
        orders: 0,
        revenue: 0
      },
      comment: 'Product statistics'
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
    tableName: 'products',
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
        fields: ['sku']
      },
      {
        fields: ['category']
      },
      {
        fields: ['status']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['is_featured']
      },
      {
        fields: ['stock_status']
      },
      {
        fields: ['price']
      },
      {
        fields: ['created_at']
      },
      {
        type: 'FULLTEXT',
        fields: ['name', 'description']
      }
    ]
  });

  // Associations
  Product.associate = (models) => {
    // Product belongs to Channel
    Product.belongsTo(models.Channel, {
      as: 'channel',
      foreignKey: 'channelId',
      onDelete: 'CASCADE'
    });

    // Product belongs to Post
    Product.belongsTo(models.Post, {
      as: 'post',
      foreignKey: 'postId'
    });

    // Product has many orders (if we implement e-commerce)
    Product.hasMany(models.Order, {
      as: 'orders',
      foreignKey: 'productId'
    });

    // Product has many reviews
    Product.hasMany(models.ProductReview, {
      as: 'reviews',
      foreignKey: 'productId',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Product.prototype.isAvailable = function() {
    return this.isActive && 
           this.status === 'active' && 
           this.stockStatus !== 'out_of_stock';
  };

  Product.prototype.hasStock = function() {
    if (this.isDigital) return true;
    return this.stock === null || this.stock > 0;
  };

  Product.prototype.getDisplayPrice = function() {
    if (this.price === null) return null;
    
    const formattedPrice = parseFloat(this.price).toFixed(2);
    return `${formattedPrice} ${this.currency}`;
  };

  Product.prototype.getDiscountPercentage = function() {
    if (!this.originalPrice || !this.price) return 0;
    
    const discount = ((this.originalPrice - this.price) / this.originalPrice) * 100;
    return Math.round(discount);
  };

  Product.prototype.incrementViews = async function() {
    if (!this.statistics) this.statistics = {};
    this.statistics.views = (this.statistics.views || 0) + 1;
    await this.save();
  };

  Product.prototype.incrementClicks = async function() {
    if (!this.statistics) this.statistics = {};
    this.statistics.clicks = (this.statistics.clicks || 0) + 1;
    await this.save();
  };

  Product.prototype.updateStock = async function(quantity) {
    this.stock = quantity;
    this.stockStatus = quantity > 0 ? 'in_stock' : 'out_of_stock';
    
    if (this.inventory) {
      this.inventory.quantity = quantity;
    }
    
    await this.save();
  };

  Product.prototype.decreaseStock = async function(quantity = 1) {
    if (this.isDigital) return true;
    
    if (this.stock === null || this.stock >= quantity) {
      if (this.stock !== null) {
        this.stock -= quantity;
        if (this.stock <= 0) {
          this.stock = 0;
          this.stockStatus = 'out_of_stock';
        }
      }
      
      if (this.inventory) {
        this.inventory.quantity = this.stock;
      }
      
      await this.save();
      return true;
    }
    
    return false;
  };

  Product.prototype.publish = async function() {
    this.status = 'active';
    this.isActive = true;
    await this.save();
  };

  Product.prototype.archive = async function() {
    this.status = 'archived';
    this.isActive = false;
    await this.save();
  };

  Product.prototype.feature = async function() {
    this.isFeatured = true;
    await this.save();
  };

  Product.prototype.unfeature = async function() {
    this.isFeatured = false;
    await this.save();
  };

  // Class methods
  Product.findChannelProducts = async function(channelId, options = {}) {
    const {
      page = 1,
      limit = 20,
      category = null,
      status = 'active',
      isFeatured = null,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      priceMin = null,
      priceMax = null,
      inStock = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      channelId,
      status,
      isActive: true
    };

    if (category) {
      whereClause.category = category;
    }

    if (isFeatured !== null) {
      whereClause.isFeatured = isFeatured;
    }

    if (priceMin !== null) {
      whereClause.price = {
        [sequelize.Sequelize.Op.gte]: priceMin
      };
    }

    if (priceMax !== null) {
      whereClause.price = {
        ...whereClause.price,
        [sequelize.Sequelize.Op.lte]: priceMax
      };
    }

    if (inStock === true) {
      whereClause.stockStatus = {
        [sequelize.Sequelize.Op.ne]: 'out_of_stock'
      };
    }

    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    return {
      products: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalProducts: count,
        limit
      }
    };
  };

  Product.findFeaturedProducts = async function(channelId, limit = 10) {
    return await Product.findAll({
      where: {
        channelId,
        isFeatured: true,
        status: 'active',
        isActive: true
      },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  Product.searchProducts = async function(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      channelId = null,
      category = null
    } = options;

    const offset = (page - 1) * limit;
    const whereClause = {
      [sequelize.Sequelize.Op.or]: [
        { name: { [sequelize.Sequelize.Op.like]: `%${query}%` } },
        { description: { [sequelize.Sequelize.Op.like]: `%${query}%` } },
        { tags: { [sequelize.Sequelize.Op.contains]: [query] } }
      ],
      status: 'active',
      isActive: true
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    if (category) {
      whereClause.category = category;
    }

    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      products: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalProducts: count,
        limit
      }
    };
  };

  Product.getCategories = async function(channelId = null) {
    const whereClause = {
      status: 'active',
      isActive: true
    };

    if (channelId) {
      whereClause.channelId = channelId;
    }

    const categories = await Product.findAll({
      where: whereClause,
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category'],
      having: sequelize.where(sequelize.fn('COUNT', sequelize.col('id')), '>', 0),
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    return categories.filter(cat => cat.category);
  };

  Product.getStatistics = async function(channelId = null) {
    const whereClause = {};
    
    if (channelId) {
      whereClause.channelId = channelId;
    }

    const stats = await Product.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('id'))), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = "active" THEN 1 END')), 'active'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_featured = true THEN 1 END')), 'featured'],
        [sequelize.fn('AVG', sequelize.col('price')), 'avgPrice'],
        [sequelize.fn('MIN', sequelize.col('price')), 'minPrice'],
        [sequelize.fn('MAX', sequelize.col('price')), 'maxPrice']
      ],
      raw: true
    });

    return stats[0];
  };

  return Product;
};
