require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8007;
const INSTANCE_ID = process.env.INSTANCE_ID || `review-instance-${PORT}`;

// Load balancing tracking header
app.use((req, res, next) => {
  res.setHeader('X-Served-By', INSTANCE_ID);
  next();
});

// Middleware to extract user identity passed by the API Gateway
app.use((req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'] || null,
    role: req.headers['x-user-role'] || 'Customer',
    email: req.headers['x-user-email'] || ''
  };
  next();
});

// MongoDB Review Schema
const ReviewSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userEmail: { type: String },
  productId: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Review = mongoose.model('Review', ReviewSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/reviewdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log(`Connected to MongoDB reviewdb [Instance: ${INSTANCE_ID}]`))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'review-service',
    instanceId: INSTANCE_ID,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Route 1: Post a new Review (Customer or Admin)
router.post('/', async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    if (!productId || rating === undefined || !comment) {
      return res.status(400).json({ error: "productId, rating (1-5), and comment are required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const review = new Review({
      userId: req.user.id || req.user._id,
      userEmail: req.user.email || req.body.userEmail,
      productId,
      rating: Number(rating),
      comment
    });

    await review.save();
    res.status(201).json({
      message: "Review created successfully",
      review,
      servedBy: INSTANCE_ID
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 2: Get All Reviews (supports filtering ?productId=... or ?userId=...)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.query.userId) filter.userId = req.query.userId;

    const reviews = await Review.find(filter).sort({ createdAt: -1 });
    res.json({
      count: reviews.length,
      reviews,
      servedBy: INSTANCE_ID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 3: Get Reviews for a specific product with rating summary
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId }).sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? Number((reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1))
      : 0;

    res.json({
      productId,
      averageRating,
      totalReviews,
      reviews,
      servedBy: INSTANCE_ID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 4: Get a Single Review by ID
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.json({ review, servedBy: INSTANCE_ID });
  } catch (err) {
    res.status(400).json({ error: "Invalid review ID format" });
  }
});

// Route 5: Update a Review (Owner only)
router.put('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Check ownership: Customer can only edit their own review
    if (req.user.role !== 'Admin' && review.userId !== (req.user.id || req.user._id)) {
      return res.status(403).json({ message: "Access Denied: You can only update your own review" });
    }

    if (req.body.rating !== undefined) {
      if (req.body.rating < 1 || req.body.rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      review.rating = Number(req.body.rating);
    }

    if (req.body.comment !== undefined) {
      review.comment = req.body.comment;
    }

    review.updatedAt = Date.now();
    await review.save();

    res.json({
      message: "Review updated successfully",
      review,
      servedBy: INSTANCE_ID
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 6: Delete a Review (Owner or Admin)
router.delete('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Role-based authorization: Owner or Admin can delete
    const isOwner = review.userId === (req.user.id || req.user._id);
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to delete this review" });
    }

    await Review.findByIdAndDelete(req.params.id);
    res.json({
      message: "Review deleted successfully",
      reviewId: req.params.id,
      deletedByRole: req.user.role,
      servedBy: INSTANCE_ID
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Support both direct access and gateway-proxied paths
app.use('/api/reviews', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Review Service running on port ${PORT} [Instance: ${INSTANCE_ID}]`));
