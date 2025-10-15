// API基础URL
const API_BASE_URL = 'http://47.122.72.104:3001/api';

// 状态管理
let currentUser = null;
let seats = [];

// 从localStorage加载token
function loadAuthToken() {
    return localStorage.getItem('authToken');
}

// 保存token到localStorage
function saveAuthToken(token) {
    localStorage.setItem('authToken', token);
}

// 清除token
function clearAuthToken() {
    localStorage.removeItem('authToken');
}

// 获取最新座位状态
async function fetchSeats() {
    try {
        const response = await fetch(`${API_BASE_URL}/seats`);
        if (!response.ok) {
            throw new Error('获取座位信息失败');
        }
        seats = await response.json();
        renderSeats();
    } catch (error) {
        console.error('获取座位信息出错:', error);
        // 在API不可用时使用模拟数据
        if (seats.length === 0) {
            seats = Array(121).fill(null).map((_, index) => ({
                id: index + 1,
                isReserved: false,
                reservedBy: null,
                reservedUntil: null
            }));
            renderSeats();
        }
    }
}

// 渲染座位
function renderSeats() {
    const seatsGrid = document.getElementById('seats-grid');
    seatsGrid.innerHTML = '';
    
        seats.forEach(seat => {
        const seatElement = document.createElement('button');
        seatElement.classList.add('seat');
        seatElement.textContent = seat.id;
        
        if (seat.isReserved) {
            seatElement.classList.add('reserved');
            if (currentUser && seat.reservedBy === currentUser.id) {
                seatElement.title = `你已预约此座位，有效期至: ${seat.reservedUntil ? new Date(seat.reservedUntil).toLocaleTimeString() : ''}`;
            } else if (seat.username) {
                seatElement.title = `已被 ${seat.username} 预约，有效期至: ${seat.reservedUntil ? new Date(seat.reservedUntil).toLocaleTimeString() : ''}`;
            } else {
                // 为了确保即使没有username字段也能正常显示
                seatElement.title = `已被用户预约，有效期至: ${seat.reservedUntil ? new Date(seat.reservedUntil).toLocaleTimeString() : ''}`;
            }
        }
        
        seatElement.addEventListener('click', () => handleSeatClick(seat.id));
        seatsGrid.appendChild(seatElement);
    });
}

// 处理座位点击
async function handleSeatClick(seatId) {
    const seatIndex = seats.findIndex(s => s.id === seatId);
    const seat = seats[seatIndex];
    
    if (!currentUser) {
        alert('请先登录');
        return;
    }
    
    if (seat.isReserved) {
        // 如果是当前用户预约的座位，可以取消
        if (seat.reservedBy === currentUser.id) {
            if (confirm('确定要取消预约吗？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/seats/cancel`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${loadAuthToken()}`
                        },
                        body: JSON.stringify({ seatId })
                    });
                    
                    if (!response.ok) {
                        throw new Error('取消预约失败');
                    }
                    
                    await fetchSeats();
                    alert('预约已取消');
                } catch (error) {
                    console.error('取消预约出错:', error);
                    alert('取消预约失败，请稍后再试');
                }
            }
        } else {
            alert(`该座位已被${seat.username}预约`);
        }
        return;
    }
    
    // 获取预约时长
    const hours = parseInt(document.getElementById('reservation-time').value);
    
    try {
        const response = await fetch(`${API_BASE_URL}/seats/reserve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${loadAuthToken()}`
            },
            body: JSON.stringify({ seatId, hours })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '预约失败');
        }
        
        const data = await response.json();
        await fetchSeats();
        alert(`座位 ${seatId} 预约成功！有效期至 ${new Date(data.reservedUntil).toLocaleTimeString()}`);
    } catch (error) {
        console.error('预约座位出错:', error);
        alert(error.message);
    }
}

// 处理登录
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '登录失败');
        }
        
        const data = await response.json();
        saveAuthToken(data.token);
        currentUser = data.user;
        await fetchSeats();
        updateUI();
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('login-form').reset();
        alert('登录成功！');
    } catch (error) {
        console.error('登录出错:', error);
        alert(error.message);
    }
}

// 处理注册
async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    
    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '注册失败');
        }
        
        const data = await response.json();
        document.getElementById('register-modal').classList.add('hidden');
        document.getElementById('register-form').reset();
        alert(`注册成功！您的唯一识别码是：${data.uniqueId}`);
    } catch (error) {
        console.error('注册出错:', error);
        alert(error.message);
    }
}

// 处理登出
function handleLogout() {
    currentUser = null;
    clearAuthToken();
    updateUI();
    alert('已退出登录');
}

// 重置所有座位
async function resetAllSeats() {
    if (!currentUser || !currentUser.isAdmin) {
        alert('只有管理员才能重置座位');
        return;
    }
    
    if (confirm('确定要重置所有座位吗？这将清除所有预约记录。')) {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/reset-seats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loadAuthToken()}`
                }
            });
            
            if (!response.ok) {
                throw new Error('重置座位失败');
            }
            
            await fetchSeats();
            alert('所有座位已重置');
        } catch (error) {
            console.error('重置座位出错:', error);
            alert('重置座位失败，请稍后再试');
        }
    }
}

// 渲染用户列表
async function renderUsersList() {
    if (!currentUser || !currentUser.isAdmin) {
        alert('只有管理员才能管理用户');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${loadAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取用户列表失败');
        }
        
        const users = await response.json();
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            
            userItem.innerHTML = `
                <div>
                    <strong>用户名：</strong>${user.username} <br>
                    <strong>识别码：</strong>${user.uniqueId} <br>
                    <strong>权限：</strong>${user.isAdmin ? '管理员' : '普通用户'}
                </div>
                <button class="delete-btn" data-userid="${user.id}">删除</button>
            `;
            
            usersList.appendChild(userItem);
        });
        
        // 添加删除用户事件监听
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = parseInt(this.getAttribute('data-userid'));
                deleteUser(userId);
            });
        });
        
        document.getElementById('manage-users-modal').classList.remove('hidden');
    } catch (error) {
        console.error('获取用户列表出错:', error);
        alert('获取用户列表失败，请稍后再试');
    }
}

// 删除用户
async function deleteUser(userId) {
    if (userId === currentUser.id) {
        alert('不能删除当前登录的用户');
        return;
    }
    
    if (confirm(`确定要删除该用户吗？`)) {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${loadAuthToken()}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '删除用户失败');
            }
            
            await renderUsersList();
            await fetchSeats();
        } catch (error) {
            console.error('删除用户出错:', error);
            alert(error.message);
        }
    }
}

// 更新UI
function updateUI() {
    const userInfo = document.getElementById('user-info');
    const authButtons = document.getElementById('auth-buttons');
    const seatContainer = document.getElementById('seat-container');
    const loginPrompt = document.getElementById('login-prompt');
    const adminPanel = document.getElementById('admin-panel');
    
    if (currentUser) {
        userInfo.classList.remove('hidden');
        authButtons.classList.add('hidden');
        seatContainer.classList.remove('hidden');
        loginPrompt.classList.add('hidden');
        document.getElementById('username').textContent = `欢迎，${currentUser.username} (ID: ${currentUser.uniqueId})`;
        
        // 显示管理员面板
        if (currentUser.isAdmin) {
            adminPanel.classList.remove('hidden');
        } else {
            adminPanel.classList.add('hidden');
        }
        
        // 登录后立即获取座位信息
        fetchSeats();
    } else {
        userInfo.classList.add('hidden');
        authButtons.classList.remove('hidden');
        seatContainer.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    }
}

// 尝试自动登录（从localStorage获取token）
async function tryAutoLogin() {
    const token = loadAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/user`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            currentUser = await response.json();
            return true;
        } else {
            // token无效，清除它
            clearAuthToken();
            return false;
        }
    } catch (error) {
        console.error('自动登录失败:', error);
        // API可能不可用，不做处理
        return false;
    }
}

// 简化版显示管理用户模态框函数
function showManageUsersModal() {
    console.log('尝试显示管理用户模态框');
    
    // 直接检查当前用户是否为管理员
    if (!currentUser || !currentUser.isAdmin) {
        alert('只有管理员才能管理用户');
        return;
    }
    
    try {
        // 直接显示模态框（不依赖API调用）
        const modal = document.getElementById('manage-users-modal');
        modal.style.display = 'block';
        modal.classList.remove('hidden');
        
        console.log('模态框已显示');
        
        // 尝试获取用户列表（即使失败也保持模态框显示）
        fetchUsersList().catch(err => {
            console.error('获取用户列表失败:', err);
            const usersList = document.getElementById('users-list');
            usersList.innerHTML = '<p>无法获取用户列表，请检查后端服务连接</p>';
        });
    } catch (error) {
        console.error('显示模态框时出错:', error);
        alert('打开管理用户界面失败: ' + error.message);
    }
}

// 单独的获取用户列表函数
async function fetchUsersList() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${loadAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取用户列表失败: ' + response.status);
        }
        
        const users = await response.json();
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        if (users.length === 0) {
            usersList.innerHTML = '<p>暂无用户数据</p>';
            return;
        }
        
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            
            userItem.innerHTML = `
                <div>
                    <strong>用户名：</strong>${user.username} <br>
                    <strong>识别码：</strong>${user.uniqueId} <br>
                    <strong>权限：</strong>${user.isAdmin ? '管理员' : '普通用户'}
                </div>
                <button class="delete-btn" data-userid="${user.id}">删除</button>
            `;
            
            usersList.appendChild(userItem);
        });
        
        // 添加删除用户事件监听
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = parseInt(this.getAttribute('data-userid'));
                deleteUser(userId);
            });
        });
    } catch (error) {
        console.error('获取用户列表出错:', error);
        throw error;
    }
}
// 初始化应用
async function initApp() {
    console.log('DOMContentLoaded触发');
    console.log('login-btn元素:', document.getElementById('login-btn'));
    console.log('register-btn元素:', document.getElementById('register-btn'));
    console.log('当前API_BASE_URL:', API_BASE_URL);
    // 尝试自动登录
    await tryAutoLogin();
    
    // 绑定事件监听
    document.getElementById('login-btn').addEventListener('click', () => {
        document.getElementById('login-modal').classList.remove('hidden');
    });
    
    document.getElementById('register-btn').addEventListener('click', () => {
        document.getElementById('register-modal').classList.remove('hidden');
    });
    
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // 使用异步事件处理
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin(e);
    });
    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleRegister(e);
    });
    
    document.getElementById('reset-seats-btn').addEventListener('click', async () => {
        await resetAllSeats();
    });
    
    document.getElementById('manage-users-btn').addEventListener('click', async () => {
        await renderUsersList();
    });
    
    // 关闭模态框
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').classList.add('hidden');
        });
    });
    
    // 点击模态框外部关闭
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.add('hidden');
        }
    });
    
    // 定期更新座位状态
    setInterval(fetchSeats, 60000); // 每分钟更新一次
    
    // 更新UI
    updateUI();
}

// 启动应用
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
});
// 启动应用 - 替换原有的DOMContentLoaded事件监听
function safeInitApp() {
    try {
        // 检查关键DOM元素是否存在
        const requiredElements = [
            'login-btn', 'register-btn', 'auth-buttons',
            'login-modal', 'register-modal', 'login-form', 'register-form'
        ];
        
        for (const id of requiredElements) {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`关键元素不存在: ${id}`);
            } else {
                console.log(`元素存在: ${id}`);
            }
        }
        
        // 重新绑定事件监听器
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const loginModal = document.getElementById('login-modal');
        const registerModal = document.getElementById('register-modal');
        
        if (loginBtn && loginModal) {
            loginBtn.addEventListener('click', function() {
                console.log('登录按钮被点击');
                loginModal.classList.remove('hidden');
            });
        }
        
        if (registerBtn && registerModal) {
            registerBtn.addEventListener('click', function() {
                console.log('注册按钮被点击');
                registerModal.classList.remove('hidden');
            });
        }
        
        // 初始化应用
        initApp();
    } catch (error) {
        console.error('初始化应用失败:', error);
    }
}

// 使用window.onload确保所有资源都已加载
window.onload = safeInitApp;