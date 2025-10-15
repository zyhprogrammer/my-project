require('dotenv').config();
// 后端服务器
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: ['http://classseat.zyhxx.xyz', 'http://localhost:3000'], // 允许的源
  credentials: true, // 允许携带凭证（如cookies）
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 允许的HTTP方法
  allowedHeaders: ['Content-Type', 'Authorization'] // 允许的请求头
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// 数据库连接
const dbPath = process.env.DB_PATH || path.join(__dirname, '/www/wwwroot/classseat/database/classroom.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('成功连接到SQLite数据库');
        initDatabase();
    }
});

// 初始化数据库
function initDatabase() {
    // 创建用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        uniqueId TEXT UNIQUE NOT NULL,
        isAdmin INTEGER DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('创建users表失败:', err.message);
    });

    // 创建座位表
    db.run(`CREATE TABLE IF NOT EXISTS seats (
        id INTEGER PRIMARY KEY,
        isReserved INTEGER DEFAULT 0,
        reservedBy INTEGER,
        reservedUntil TIMESTAMP,
        FOREIGN KEY (reservedBy) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('创建seats表失败:', err.message);
        else populateSeats();
    });
}

// 填充座位数据（如果为空）
function populateSeats() {
    db.get(`SELECT COUNT(*) as count FROM seats`, (err, row) => {
        if (err) {
            console.error('查询座位数量失败:', err.message);
            return;
        }

        if (row.count === 0) {
            const stmt = db.prepare(`INSERT INTO seats (id) VALUES (?)`);
            for (let i = 1; i <= 121; i++) {
                stmt.run(i);
            }
            stmt.finalize();
            console.log('已填充121个座位数据');
        }
    });
}

// JWT配置
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // 在生产环境中应使用环境变量

// 验证JWT中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// 验证管理员中间件
function authenticateAdmin(req, res, next) {
    db.get(`SELECT isAdmin FROM users WHERE id = ?`, [req.user.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        if (!row || !row.isAdmin) {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        next();
    });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务运行正常' });
});
// API路由

// 注册用户
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    try {
        // 检查用户名是否已存在
        db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: '数据库查询错误' });
            }
            if (row) {
                return res.status(400).json({ error: '用户名已存在' });
            }

            // 生成唯一识别码
            const uniqueId = 'U' + Date.now().toString().slice(-6);
            
            // 检查识别码是否唯一
            db.get(`SELECT * FROM users WHERE uniqueId = ?`, [uniqueId], async (err, row) => {
                if (row) {
                    // 如果识别码重复，重新生成
                    uniqueId = 'U' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
                }

                // 加密密码
                const hashedPassword = await bcrypt.hash(password, 10);

                // 检查是否是第一个用户（设置为管理员）
                db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
                    const isAdmin = row.count === 0 ? 1 : 0;

                    // 插入新用户
                    db.run(
                        `INSERT INTO users (username, password, uniqueId, isAdmin) VALUES (?, ?, ?, ?)`,
                        [username, hashedPassword, uniqueId, isAdmin],
                        function (err) {
                            if (err) {
                                return res.status(500).json({ error: '注册失败' });
                            }
                            res.status(201).json({
                                message: '注册成功',
                                uniqueId: uniqueId
                            });
                        }
                    );
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 用户登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        try {
            // 验证密码
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                return res.status(401).json({ error: '用户名或密码错误' });
            }

            // 生成JWT令牌
            const token = jwt.sign(
                { id: user.id, username: user.username, uniqueId: user.uniqueId },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                token: token,
                user: {
                    id: user.id,
                    username: user.username,
                    uniqueId: user.uniqueId,
                    isAdmin: user.isAdmin
                }
            });
        } catch (error) {
            res.status(500).json({ error: '服务器错误' });
        }
    });
});

// 获取当前用户信息
app.get('/api/user', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, uniqueId, isAdmin FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(user);
    });
});

// 获取所有座位信息
app.get('/api/seats', (req, res) => {
    db.all(`SELECT seats.*, users.username FROM seats LEFT JOIN users ON seats.reservedBy = users.id`, (err, seats) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        
        // 检查过期的预约
        const now = new Date().toISOString();
        seats.forEach(seat => {
            if (seat.reservedUntil && seat.reservedUntil < now) {
                db.run(`UPDATE seats SET isReserved = 0, reservedBy = NULL, reservedUntil = NULL WHERE id = ?`, [seat.id]);
                seat.isReserved = 0;
                seat.reservedBy = null;
                seat.reservedUntil = null;
                seat.username = null;
            }
        });
        
        res.json(seats);
    });
});

// 预约座位
app.post('/api/seats/reserve', authenticateToken, (req, res) => {
    const { seatId, hours } = req.body;

    if (!seatId || !hours) {
        return res.status(400).json({ error: '座位ID和预约时长不能为空' });
    }

    // 检查座位是否已被预约
    db.get(`SELECT * FROM seats WHERE id = ?`, [seatId], (err, seat) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        if (!seat) {
            return res.status(404).json({ error: '座位不存在' });
        }
        
        // 检查预约是否过期
        const now = new Date().toISOString();
        if (seat.reservedUntil && seat.reservedUntil < now) {
            // 过期了，允许预约
            db.run(`UPDATE seats SET isReserved = 0, reservedBy = NULL, reservedUntil = NULL WHERE id = ?`, [seat.id]);
        }
        
        if (seat.isReserved) {
            return res.status(400).json({ error: '该座位已被预约' });
        }

        // 计算预约结束时间
        const nowDate = new Date();
        const reservedUntil = new Date(nowDate.getTime() + hours * 60 * 60 * 1000).toISOString();

        // 更新座位状态
        db.run(
            `UPDATE seats SET isReserved = 1, reservedBy = ?, reservedUntil = ? WHERE id = ?`,
            [req.user.id, reservedUntil, seatId],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: '预约失败' });
                }
                res.json({
                    message: '预约成功',
                    seatId: seatId,
                    reservedUntil: reservedUntil
                });
            }
        );
    });
});

// 取消预约
app.post('/api/seats/cancel', authenticateToken, (req, res) => {
    const { seatId } = req.body;

    if (!seatId) {
        return res.status(400).json({ error: '座位ID不能为空' });
    }

    // 检查座位是否由当前用户预约
    db.get(`SELECT * FROM seats WHERE id = ?`, [seatId], (err, seat) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        if (!seat) {
            return res.status(404).json({ error: '座位不存在' });
        }
        if (!seat.isReserved || seat.reservedBy !== req.user.id) {
            return res.status(403).json({ error: '您只能取消自己的预约' });
        }

        // 取消预约
        db.run(
            `UPDATE seats SET isReserved = 0, reservedBy = NULL, reservedUntil = NULL WHERE id = ?`,
            [seatId],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: '取消预约失败' });
                }
                res.json({ message: '预约已取消' });
            }
        );
    });
});

// 管理员：重置所有座位
app.post('/api/admin/reset-seats', authenticateToken, authenticateAdmin, (req, res) => {
    db.run(`UPDATE seats SET isReserved = 0, reservedBy = NULL, reservedUntil = NULL`, (err) => {
        if (err) {
            return res.status(500).json({ error: '重置座位失败' });
        }
        res.json({ message: '所有座位已重置' });
    });
});

// 管理员：获取所有用户
app.get('/api/admin/users', authenticateToken, authenticateAdmin, (req, res) => {
    db.all(`SELECT id, username, uniqueId, isAdmin, createdAt FROM users`, (err, users) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        res.json(users);
    });
});

// 管理员：删除用户
app.delete('/api/admin/users/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const userId = parseInt(req.params.id);

    if (userId === req.user.id) {
        return res.status(403).json({ error: '不能删除当前登录的用户' });
    }

    // 开始事务
    db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
            return res.status(500).json({ error: '事务开始失败' });
        }

        // 先清除该用户的座位预约
        db.run(`UPDATE seats SET isReserved = 0, reservedBy = NULL, reservedUntil = NULL WHERE reservedBy = ?`, [userId], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: '清除用户预约失败' });
            }

            // 然后删除用户
            db.run(`DELETE FROM users WHERE id = ?`, [userId], function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: '删除用户失败' });
                }

                if (this.changes === 0) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: '用户不存在' });
                }

                // 提交事务
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: '事务提交失败' });
                    }
                    res.json({ message: '用户已删除' });
                });
            });
        });
    });
});

// 前端页面路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});