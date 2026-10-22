require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// Middleware to extract user identity passed by the API Gateway
app.use((req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'] || null,
    role: req.headers['x-user-role'] || 'Customer',
    email: req.headers['x-user-email'] || ''
  };
  next();
});

const PORT = process.env.PORT || 8004;

// MongoDB Inventory Schema
const InventorySchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  productName: { type: String },
  quantity: { type: Number, required: true, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  updatedAt: { type: Date, default: Date.now }
});

const Inventory = mongoose.model('Inventory', InventorySchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/inventorydb';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB inventorydb'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'inventory-service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Route 1: Add / Initialize Inventory for Product (Admin Only)
router.post('/', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: "Access Denied: Admin role required" });
  }

  try {
    const { productId, productName, quantity, lowStockThreshold } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({ error: "productId and quantity are required" });
    }

    if (quantity < 0) {
      return res.status(400).json({ error: "Quantity cannot be negative" });
    }

    const existingItem = await Inventory.findOne({ productId });
    if (existingItem) {
      return res.status(400).json({ error: "Inventory record for this product already exists. Use PUT to update." });
    }

    const item = new Inventory({
      productId,
      productName,
      quantity: Number(quantity),
      lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5
    });

    await item.save();
    res.status(201).json({ message: "Inventory created successfully", inventory: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 2: Get All Inventory Items (Authenticated)
router.get('/', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ updatedAt: -1 });
    res.json({
      total: items.length,
      inventory: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 3: Get Stock for a Specific Product (Public/Authenticated)
router.get('/:productId', async (req, res) => {
  try {
    const item = await Inventory.findOne({ productId: req.params.productId });
    if (!item) {
      return res.status(404).json({ message: "Product not found in inventory" });
    }
    res.json({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      isLowStock: item.quantity <= item.lowStockThreshold,
      inStock: item.quantity > 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 4: Update / Set Stock Quantity (Admin Only)
router.put('/:productId', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: "Access Denied: Admin role required" });
  }

  try {
    const { quantity, productName, lowStockThreshold } = req.body;

    const item = await Inventory.findOne({ productId: req.params.productId });
    if (!item) {
      return res.status(404).json({ message: "Product not found in inventory" });
    }

    if (quantity !== undefined) {
      if (quantity < 0) return res.status(400).json({ error: "Quantity cannot be negative" });
      item.quantity = Number(quantity);
    }
    if (productName !== undefined) item.productName = productName;
    if (lowStockThreshold !== undefined) item.lowStockThreshold = Number(lowStockThreshold);

    item.updatedAt = Date.now();
    await item.save();

    res.json({ message: "Inventory updated successfully", inventory: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 5: Deduct Stock (Used by Order service or customers on checkout)
router.post('/:productId/deduct', async (req, res) => {
  try {
    const deductQty = Number(req.body.quantity) || 1;
    if (deductQty <= 0) {
      return res.status(400).json({ error: "Deduction quantity must be greater than zero" });
    }

    const item = await Inventory.findOne({ productId: req.params.productId });
    if (!item) {
      return res.status(404).json({ message: "Product not found in inventory" });
    }

    if (item.quantity < deductQty) {
      return res.status(400).json({
        error: "Insufficient stock",
        available: item.quantity,
        requested: deductQty
      });
    }

    item.quantity -= deductQty;
    item.updatedAt = Date.now();
    await item.save();

    res.json({
      message: "Stock deducted successfully",
      productId: item.productId,
      remainingStock: item.quantity
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 6: Delete Inventory Item (Admin Only)
router.delete('/:productId', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: "Access Denied: Admin role required" });
  }

  try {
    const item = await Inventory.findOneAndDelete({ productId: req.params.productId });
    if (!item) {
      return res.status(404).json({ message: "Product not found in inventory" });
    }
    res.json({ message: "Inventory item deleted successfully", productId: req.params.productId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mount router on both direct and gateway paths
app.use('/api/inventory', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Inventory Service running on port ${PORT}`));
