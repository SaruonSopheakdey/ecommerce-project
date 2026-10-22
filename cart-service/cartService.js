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

const PORT = process.env.PORT || 8005;

// MongoDB Cart Item Schema
const CartItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, default: 1, min: 1 }
}, { _id: false });

// MongoDB Cart Schema
const CartSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  items: [CartItemSchema],
  totalPrice: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

// Helper to recalculate total cart price
function recalculateTotal(cart) {
  cart.totalPrice = Number(
    cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)
  );
  cart.updatedAt = Date.now();
}

const Cart = mongoose.model('Cart', CartSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cartdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB cartdb'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'cart-service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Route 1: Get Current User's Cart
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.json({
        userId,
        items: [],
        totalPrice: 0,
        message: "Cart is empty"
      });
    }

    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 2: Add Item to Cart
router.post('/items', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId, productName, price, quantity } = req.body;

    if (!productId || price === undefined) {
      return res.status(400).json({ error: "productId and price are required" });
    }

    const itemQty = Number(quantity) > 0 ? Number(quantity) : 1;
    const itemPrice = Number(price);

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingIndex = cart.items.findIndex(item => item.productId === productId);
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += itemQty;
      if (productName) cart.items[existingIndex].productName = productName;
      cart.items[existingIndex].price = itemPrice;
    } else {
      cart.items.push({
        productId,
        productName: productName || "Product",
        price: itemPrice,
        quantity: itemQty
      });
    }

    recalculateTotal(cart);
    await cart.save();

    res.status(201).json({ message: "Item added to cart", cart });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 3: Update Item Quantity in Cart
router.put('/items/:productId', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ error: "quantity is required" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    const newQty = Number(quantity);
    if (newQty <= 0) {
      // Remove item if quantity set to 0 or less
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = newQty;
    }

    recalculateTotal(cart);
    await cart.save();

    res.json({ message: "Cart item updated", cart });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 4: Remove Specific Item from Cart
router.delete('/items/:productId', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    cart.items.splice(itemIndex, 1);
    recalculateTotal(cart);
    await cart.save();

    res.json({ message: "Item removed from cart", cart });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 5: Clear Cart (e.g. after placing an order)
router.delete('/', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items = [];
    cart.totalPrice = 0;
    cart.updatedAt = Date.now();
    await cart.save();

    res.json({ message: "Cart cleared successfully", cart });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 6: Get Cart by User ID (Admin or Resource Owner)
router.get('/user/:userId', async (req, res) => {
  try {
    const requestedUserId = req.params.userId;
    const currentUserId = req.user.id || req.user._id;

    if (req.user.role !== 'Admin' && currentUserId !== requestedUserId) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to view another user's cart" });
    }

    const cart = await Cart.findOne({ userId: requestedUserId });
    if (!cart) {
      return res.json({ userId: requestedUserId, items: [], totalPrice: 0, message: "Cart is empty" });
    }

    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mount router on both direct and gateway paths
app.use('/api/cart', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Cart Service running on port ${PORT}`));
