require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { verifyToken, requireRole } = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8003;
const INSTANCE_ID = process.env.INSTANCE_ID || `product-instance-${PORT}`;

// Load balancing tracking header
app.use((req, res, next) => {
  res.setHeader('X-Served-By', INSTANCE_ID);
  next();
});

// MongoDB Product Schema
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 }
});
const Product = mongoose.model('Product', ProductSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/productdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log(`Connected to MongoDB productdb [Instance: ${INSTANCE_ID}]`))
  .catch(err => console.error('MongoDB connection error:', err));

const router = express.Router();

// Health check endpoint for load balancing inspection
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'product-service',
    instanceId: INSTANCE_ID,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Route 1: Get All Products
router.get('/', verifyToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 2: Add Product (Admin Only)
router.post('/', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mount router on both direct and gateway paths
app.use('/api/products', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Product Service running on port ${PORT} [Instance: ${INSTANCE_ID}]`));