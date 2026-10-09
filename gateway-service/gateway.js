const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 1. Auth Service
app.use('/api/auth', createProxyMiddleware({ 
  target: 'http://localhost:8001', 
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api' }
}));

// 2. Product Service
app.use('/api/products', createProxyMiddleware({ 
  target: 'http://localhost:8003', 
  changeOrigin: true 
}));

// 3. Order Service
app.use('/api/orders', createProxyMiddleware({ 
  target: 'http://localhost:8002', 
  changeOrigin: true 
}));

app.listen(8000, () => console.log('API Gateway running on port 8000'));