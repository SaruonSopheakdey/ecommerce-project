require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
const INSTANCE_ID = process.env.INSTANCE_ID || 'gateway';

// Tag response with which gateway replica handled the request
app.use((req, res, next) => {
  res.setHeader('X-Gateway-Instance', INSTANCE_ID);
  next();
});

// -------------------------------------------------------------
// Centralized JWT Authentication & Header Sanitization
// -------------------------------------------------------------
const isPublicRoute = (req) => {
  const path = req.path.replace(/\/+$/, '') || '/';

  // 1. Health check endpoints
  if (path === '/health' || path.endsWith('/health')) return true;

  // 2. Authentication routes (Registration and Login)
  if (path.startsWith('/api/auth')) return true;

  // 3. Public catalog browsing
  if (req.method === 'GET' && path.startsWith('/api/products')) return true;

  // 4. Public review browsing
  if (req.method === 'GET' && path.startsWith('/api/reviews')) return true;

  // 5. Public stock status check
  if (req.method === 'GET' && /^\/api\/inventory\/[^/]+$/.test(path)) return true;

  return false;
};

const gatewayAuthMiddleware = (req, res, next) => {
  // Strip untrusted identity headers from external requests to prevent spoofing
  delete req.headers['x-user-id'];
  delete req.headers['x-user-role'];
  delete req.headers['x-user-email'];

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (isPublicRoute(req)) {
      return next();
    }
    return res.status(401).json({ message: "Access Denied: No Token Provided" });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;

    // RBAC: Check for Admin-only product creation
    const cleanPath = req.path.replace(/\/+$/, '') || '/';
    if (req.method === 'POST' && cleanPath === '/api/products' && verified.role !== 'Admin') {
      return res.status(403).json({ message: "Access Denied: Unauthorized Role" });
    }

    // Set forwarded user identity headers for downstream microservices
    req.headers['x-user-id'] = String(verified.id || verified._id || '');
    req.headers['x-user-role'] = String(verified.role || 'Customer');
    req.headers['x-user-email'] = String(verified.email || '');

    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid or Expired Token" });
  }
};

// Apply centralized JWT verification to all incoming requests
app.use(gatewayAuthMiddleware);

// Helper to inject identity headers into outgoing proxy requests
const injectUserHeaders = (proxyReq, req) => {
  if (req.user) {
    proxyReq.setHeader('x-user-id', String(req.user.id || req.user._id || ''));
    proxyReq.setHeader('x-user-role', String(req.user.role || 'Customer'));
    proxyReq.setHeader('x-user-email', String(req.user.email || ''));
  }
};

// Clean 502 error handler if a downstream microservice is unreachable
const handleProxyError = (err, req, res) => {
  console.error(`[API Gateway ${INSTANCE_ID}] Proxy error on ${req.originalUrl}:`, err.message);
  if (!res.headersSent) {
    res.status(502).json({
      error: "Bad Gateway",
      message: `Downstream service unreachable: ${err.message}`,
      gatewayInstance: INSTANCE_ID
    });
  }
};

// -------------------------------------------------------------
// Downstream Microservice URLs & Routes
// -------------------------------------------------------------
const SERVICES_HOST = process.env.SERVICES_HOST || 'localhost';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || `http://${SERVICES_HOST}:8001`;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || `http://${SERVICES_HOST}:8003`;
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || `http://${SERVICES_HOST}:8004`;
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || `http://${SERVICES_HOST}:8005`;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || `http://${SERVICES_HOST}:8002`;
const REVIEW_SERVICE_URL = process.env.REVIEW_SERVICE_URL || `http://${SERVICES_HOST}:8007`;
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || `http://${SERVICES_HOST}:8008`;

// 1. Auth Service (Port 8001)
app.use('/api/auth', createProxyMiddleware({ 
  target: AUTH_SERVICE_URL, 
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api' },
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 2. Product Catalog Service (Port 8003)
const productInstances = (process.env.PRODUCT_SERVICE_URLS || PRODUCT_SERVICE_URL).split(',').map(s => s.trim());
let productTurn = 0;

app.use('/api/products', createProxyMiddleware({ 
  router: () => {
    const selectedTarget = productInstances[productTurn % productInstances.length];
    productTurn++;
    return selectedTarget;
  },
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 3. Inventory Service (Port 8004)
app.use('/api/inventory', createProxyMiddleware({ 
  target: INVENTORY_SERVICE_URL, 
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 4. Cart Service (Port 8005)
app.use('/api/cart', createProxyMiddleware({ 
  target: CART_SERVICE_URL, 
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 5. Order Service (Port 8002)
app.use('/api/orders', createProxyMiddleware({ 
  target: ORDER_SERVICE_URL, 
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 6. Review & Rating Service (Port 8007)
const reviewInstances = (process.env.REVIEW_SERVICE_URLS || REVIEW_SERVICE_URL).split(',').map(s => s.trim());
let reviewTurn = 0;

app.use('/api/reviews', createProxyMiddleware({ 
  router: () => {
    const selectedTarget = reviewInstances[reviewTurn % reviewInstances.length];
    reviewTurn++;
    return selectedTarget;
  },
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// 7. Notification / Email Service (Port 8008)
app.use('/api/notifications', createProxyMiddleware({ 
  target: NOTIFICATION_SERVICE_URL, 
  changeOrigin: true,
  on: {
    proxyReq: injectUserHeaders,
    error: handleProxyError
  }
}));

// Gateway Health & Route Inspection
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'api-gateway',
    instance: INSTANCE_ID,
    authOffloading: 'ENABLED',
    timestamp: new Date().toISOString(),
    routes: {
      auth: AUTH_SERVICE_URL,
      products: productInstances,
      inventory: INVENTORY_SERVICE_URL,
      cart: CART_SERVICE_URL,
      orders: ORDER_SERVICE_URL,
      reviews: reviewInstances,
      notifications: NOTIFICATION_SERVICE_URL
    }
  });
});

app.listen(PORT, () => console.log(`API Gateway [${INSTANCE_ID}] running on port ${PORT}`));
