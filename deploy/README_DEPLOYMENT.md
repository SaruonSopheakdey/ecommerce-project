# 4-EC2 Production Architecture (Gateway Clustered + MongoDB Atlas)

This deployment architecture uses **4 AWS EC2 instances** with **High Availability API Gateway Load Balancing** at the edge and **MongoDB Atlas** as the cloud database engine.

---

## 🏛️ System Architecture

```
                        +-----------------------+
                        |   Postman / Client    |
                        +-----------+-----------+
                                    |  http://<EC2-1-PUBLIC-IP>:80 (Public Entry)
                                    v
                        +-----------------------+
                        |  EC2 #1: Nginx (Edge) |   round-robin load balancing + failover
                        +-----------+-----------+
                          |                   |
                          | (Port 8000)       | (Port 8000)
                          v                   v
                +----------------+   +----------------+
                | EC2 #2:        |   | EC2 #3:        |
                | Gateway #1     |   | Gateway #2     |   Centralized JWT validation,
                +-------+--------+   +--------+-------+   header sanitization & dispatch
                        \_____________  _____/
                                      \/
                     Forward to EC2 #4 (Ports 8001-8008)
                                      v
     +-------------------------------------------------------------------+
     | EC2 #4: Core Business Microservices                               |
     | - Auth Service (8001)         - Inventory Service (8004)          |
     | - Product Service (8003)      - Cart Service (8005)               |
     | - Order Service (8002)        - Review Service (8007)             |
     | - Notification Service (8008)                                     |
     +---------------------------------+---------------------------------+
                                       |
                            Connect over TLS (SRV)
                                       v
     +-------------------------------------------------------------------+
     |                     MongoDB Atlas (Cloud Cluster)                 |
     |   - userdb         - inventorydb    - orderdb    - notificationdb |
     |   - productdb      - cartdb         - reviewdb                    |
     +-------------------------------------------------------------------+
```

---

## 👥 EC2 Roles & Security Groups

Configure your AWS Security Groups with the following inbound rules:

| Instance | Role | Inbound Port | Protocol | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EC2 #1** | **Nginx Load Balancer** | `22` | TCP | `0.0.0.0/0` | SSH Administration |
| | | `80` | TCP | `0.0.0.0/0` | **Public HTTP Entrypoint** |
| **EC2 #2** | **Gateway Replica 1** | `22` | TCP | `0.0.0.0/0` | SSH Administration |
| | | `8000` | TCP | `172.31.0.0/16` (or EC2 #1 Private IP) | Gateway requests from Nginx |
| **EC2 #3** | **Gateway Replica 2** | `22` | TCP | `0.0.0.0/0` | SSH Administration |
| | | `8000` | TCP | `172.31.0.0/16` (or EC2 #1 Private IP) | Gateway requests from Nginx |
| **EC2 #4** | **Core Microservices** | `22` | TCP | `0.0.0.0/0` | SSH Administration |
| | | `8001 - 8008` | TCP | `172.31.0.0/16` (or EC2 #2/#3 Private IP) | Microservice requests from Gateways |

---

## 🍃 MongoDB Atlas Configuration

1. In MongoDB Atlas **Network Access**, whitelist `0.0.0.0/0` (Allow Access from Anywhere).
2. In **Database Access**, create a database user (e.g. `dbuser` with password `Password123!`).
3. In **Database** → **Connect** → **Drivers (Node.js)**, copy your connection string and strip the `/test` or database suffix:
   ```text
   mongodb+srv://dbuser:Password123!@cluster0.xxxxx.mongodb.net
   ```

---

## 🚀 Step-by-Step Deployment

### Common Setup on All 4 Instances:
SSH into each Ubuntu 24.04 instance:
```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER
newgrp docker

git clone https://github.com/SaruonSopheakdey/ecommerce-project.git
cd ecommerce-project
```

---

### Step 1: Deploy EC2 #4 (Core Business Microservices)
1. SSH into **EC2 #4**.
2. Note your **EC2 #4 Private IPv4 Address** (e.g. `172.31.40.10`).
3. Configure environment:
   ```bash
   cd ~/ecommerce-project/deploy/ec2-4-services
   cp .env.example .env
   nano .env
   ```
   Set `MONGODB_URI_BASE` and `JWT_SECRET`:
   ```env
   MONGODB_URI_BASE=mongodb+srv://dbuser:Password123!@cluster0.xxxxx.mongodb.net
   JWT_SECRET=supersecretkey123
   ```
4. Build and start all 7 microservices:
   ```bash
   docker compose up -d --build
   docker compose ps
   ```

---

### Step 2: Deploy EC2 #2 (API Gateway Replica 1)
1. SSH into **EC2 #2**.
2. Note your **EC2 #2 Private IPv4 Address** (e.g. `172.31.20.10`).
3. Configure environment:
   ```bash
   cd ~/ecommerce-project/deploy/ec2-2-gateway
   cp .env.example .env
   nano .env
   ```
   Set `JWT_SECRET` and point `SERVICES_HOST` to **EC2 #4 Private IP**:
   ```env
   JWT_SECRET=supersecretkey123
   SERVICES_HOST=172.31.40.10
   ```
4. Build and start Gateway 1:
   ```bash
   docker compose up -d --build
   curl http://localhost:8000/health
   # Returns: {"status":"UP","service":"api-gateway","instance":"gateway-instance-1"}
   ```

---

### Step 3: Deploy EC2 #3 (API Gateway Replica 2)
1. SSH into **EC2 #3**.
2. Note your **EC2 #3 Private IPv4 Address** (e.g. `172.31.30.10`).
3. Configure environment:
   ```bash
   cd ~/ecommerce-project/deploy/ec2-3-gateway
   cp .env.example .env
   nano .env
   ```
   Set `JWT_SECRET` and point `SERVICES_HOST` to **EC2 #4 Private IP**:
   ```env
   JWT_SECRET=supersecretkey123
   SERVICES_HOST=172.31.40.10
   ```
4. Build and start Gateway 2:
   ```bash
   docker compose up -d --build
   curl http://localhost:8000/health
   # Returns: {"status":"UP","service":"api-gateway","instance":"gateway-instance-2"}
   ```

---

### Step 4: Deploy EC2 #1 (Nginx Edge Load Balancer)
1. SSH into **EC2 #1**.
2. Configure environment:
   ```bash
   cd ~/ecommerce-project/deploy/ec2-1-nginx
   cp .env.example .env
   nano .env
   ```
   Provide the private IPs of **EC2 #2** and **EC2 #3**:
   ```env
   EC2_2_PRIVATE_IP=172.31.20.10
   EC2_3_PRIVATE_IP=172.31.30.10
   ```
3. Start Nginx:
   ```bash
   docker compose up -d
   curl http://localhost/nginx-health
   ```

---

## 🧪 Verification & Load Balancing Checks

Test against **`http://<EC2-1-PUBLIC-IP>`** on Port 80:

### 1. Gateway Round-Robin Load Balancing
Send consecutive requests:
```bash
curl -i http://<EC2-1-PUBLIC-IP>/health
curl -i http://<EC2-1-PUBLIC-IP>/health
```
* **Request 1**: Header `X-Gateway-Instance: gateway-instance-1` (Served by EC2 #2)
* **Request 2**: Header `X-Gateway-Instance: gateway-instance-2` (Served by EC2 #3)

### 2. High Availability Gateway Failover
1. On **EC2 #2**, simulate a crash:
   ```bash
   docker stop ec2-2-gateway-1
   ```
2. Continue sending requests to `http://<EC2-1-PUBLIC-IP>/health`:
   * Nginx automatically routes 100% of traffic to **EC2 #3** (`gateway-instance-2`) with zero dropped requests.
3. Restart EC2 #2:
   ```bash
   docker start ec2-2-gateway-1
   ```
   * Nginx immediately resumes load balancing across both replicas.

### 3. Centralized JWT Auth & MongoDB Atlas Persistence
```bash
# Register a user:
curl -X POST http://<EC2-1-PUBLIC-IP>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"student@aupp.edu.kh","password":"Password123","role":"Customer"}'

# Login:
TOKEN=$(curl -s -X POST http://<EC2-1-PUBLIC-IP>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@aupp.edu.kh","password":"Password123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Authenticated Order Creation:
curl -i -X POST http://<EC2-1-PUBLIC-IP>/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"PROD-101","quantity":2,"totalPrice":99.98}'
```
Document is validated through Nginx → Gateway → Order Service → persisted into MongoDB Atlas `orderdb.orders`.
