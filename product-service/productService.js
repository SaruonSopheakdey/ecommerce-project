const express = require('express');
const mongoose = require('mongoose');
const { verifyToken, requireRole } = require('./authMiddleware');

const app = express();
app.use(express.json());

// MongoDB Product Schema
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 }
});
const Product = mongoose.model('Product', ProductSchema);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/productdb')
  .then(() => console.log('Connected to MongoDB productdb'))
  .catch(err => console.error('MongoDB connection error:', err));

// Route 1: Get All Products (Gateway proxies /api/products here as /)
app.get('/', verifyToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 2: Add Product (Admin Only)
app.post('/', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(8003, () => console.log('Product Service running on port 8003'));