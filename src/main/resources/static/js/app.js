// app.js

let stompClient = null;
let currentRoom = null;
let currentUsername = null;
let colors = [
    'text-red-400', 'text-yellow-400', 'text-green-400',
    'text-blue-400', 'text-indigo-400', 'text-purple-400', 'text-pink-400'
];

let typingTimer;
let isTyping = false;
let userColors = {};

// DOM Elements
const screens = {
    home: document.getElementById('home-screen'),
    join: document.getElementById('join-screen'),
    chat: document.getElementById('chat-screen')
};

const inputs = {
    username: document.getElementById('username'),
    roomCode: document.getElementById('room-code-input'),
    message: document.getElementById('message-input')
};

const buttons = {
    createRoom: document.getElementById('btn-create-room'),
    showJoin: document.getElementById('btn-show-join'),
    backJoin: document.getElementById('btn-back-join'),
    joinRoom: document.getElementById('btn-join-room'),
    leaveRoom: document.getElementById('btn-leave-room'),
    send: document.getElementById('btn-send')
};

const chatArea = {
    messages: document.getElementById('chat-messages'),
    roomCodeDisplay: document.getElementById('display-room-code'),
    userCount: document.getElementById('active-users-count'),
    typingIndicator: document.getElementById('typing-indicator'),
    form: document.getElementById('chat-form'),
    showUsersBtn: document.getElementById('btn-show-users'),
    usersModal: document.getElementById('users-modal'),
    usersList: document.getElementById('users-list'),
    closeUsersBtn: document.getElementById('btn-close-users')
};

let lastActiveUsers = [];

// Utilities
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.add('hidden');
        screen.classList.remove('active');
    });

    // Add small delay to allow display:block before opacity transition
    screens[screenName].classList.remove('hidden');
    setTimeout(() => {
        screens[screenName].classList.add('active');
        // Auto focus inputs
        if (screenName === 'join') inputs.roomCode.focus();
        if (screenName === 'chat') inputs.message.focus();
    }, 10);

}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        error: 'bg-red-500/90 border-red-600',
        success: 'bg-green-500/90 border-green-600',
        info: 'bg-blue-500/90 border-blue-600'
    };

    toast.className = `${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm transform transition-all duration-300 translate-x-full opacity-0 flex items-center gap-3`;

    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function validateUsername() {
    const username = inputs.username.value.trim();
    if (!username) {
        showToast('Please enter a display name first', 'error');
        inputs.username.focus();
        inputs.username.classList.add('border-red-500', 'animate-pulse');
        setTimeout(() => inputs.username.classList.remove('border-red-500', 'animate-pulse'), 1000);
        return false;
    }
    currentUsername = username;
    return true;
}

function getUserColor(username) {
    if (!userColors[username]) {
        // Hash string to pick color
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        let index = Math.abs(hash % colors.length);
        userColors[username] = colors[index];
    }
    return userColors[username];
}

// Event Listeners - Navigation
buttons.showJoin.addEventListener('click', () => {
    if (validateUsername()) showScreen('join');
});

buttons.backJoin.addEventListener('click', () => {
    showScreen('home');
    document.getElementById('join-error').classList.add('hidden');
});

// Create Room Flow
buttons.createRoom.addEventListener('click', async () => {
    if (!validateUsername()) return;

    // Disable button to prevent spam
    const originalContent = buttons.createRoom.innerHTML;
    buttons.createRoom.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-2xl text-purple-400"></i><span class="font-medium text-sm">Creating...</span>';
    buttons.createRoom.disabled = true;

    try {
        const response = await fetch('/api/room/create');
        const data = await response.json();
        const code = data.roomCode;

        connectToWebSocket(code);
    } catch (e) {
        showToast('Failed to create room', 'error');
    } finally {
        buttons.createRoom.innerHTML = originalContent;
        buttons.createRoom.disabled = false;
    }
});

// Join Room Flow
buttons.joinRoom.addEventListener('click', async () => {
    const code = inputs.roomCode.value.trim().toUpperCase();
    const errorEl = document.getElementById('join-error');

    if (code.length !== 6) {
        errorEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Code must be 6 characters';
        errorEl.classList.remove('hidden');
        return;
    }

    // Disable button
    const originalContent = buttons.joinRoom.innerHTML;
    buttons.joinRoom.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Joining...';
    buttons.joinRoom.disabled = true;

    try {
        const response = await fetch(`/api/room/check/${code}`);
        const data = await response.json();

        if (data.exists) {
            connectToWebSocket(code);
        } else {
            errorEl.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Room not found';
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        showToast('Failed to check room', 'error');
    } finally {
        buttons.joinRoom.innerHTML = originalContent;
        buttons.joinRoom.disabled = false;
    }
});

// Copy Room Code
chatArea.roomCodeDisplay.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        showToast('Room code copied!', 'success');
    });
});

// WebSocket Configuration
function connectToWebSocket(roomCode) {
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // Disable debug logging

    stompClient.connect({}, () => {
        onConnected(roomCode);
    }, onError);
}

function onConnected(roomCode) {
    currentRoom = roomCode;

    // Subscribe to the Public Topic
    stompClient.subscribe(`/topic/room/${currentRoom}`, onMessageReceived);

    // Tell server user joined
    stompClient.send(`/app/chat/${currentRoom}/addUser`,
        {},
        JSON.stringify({ sender: currentUsername, type: 'JOIN' })
    );

    // Setup UI
    chatArea.roomCodeDisplay.innerText = currentRoom;
    chatArea.messages.innerHTML = ''; // Clear old messages
    showScreen('chat');
}

function onError(error) {
    showToast('Could not connect to WebSocket server. Please refresh.', 'error');
}

function disconnect() {
    if (stompClient !== null) {
        stompClient.disconnect();
    }
    showScreen('home');
    currentRoom = null;
    showToast('Left the room', 'info');
}

buttons.leaveRoom.addEventListener('click', disconnect);

// Users List Modal Toggle
chatArea.showUsersBtn.addEventListener('click', () => {
    chatArea.usersModal.classList.remove('hidden');
    setTimeout(() => {
        chatArea.usersModal.classList.remove('opacity-0');
        chatArea.usersModal.querySelector('div').classList.remove('scale-95');
        updateUsersListUI();
    }, 10);
});

function hideUsersModal() {
    chatArea.usersModal.classList.add('opacity-0');
    chatArea.usersModal.querySelector('div').classList.add('scale-95');
    setTimeout(() => chatArea.usersModal.classList.add('hidden'), 300);
}

chatArea.closeUsersBtn.addEventListener('click', hideUsersModal);
chatArea.usersModal.addEventListener('click', (e) => {
    if (e.target === chatArea.usersModal) hideUsersModal();
});

function updateUsersListUI() {
    chatArea.usersList.innerHTML = '';
    lastActiveUsers.sort().forEach(user => {
        const isMe = user === currentUsername;
        const colorClass = getUserColor(user);
        const el = document.createElement('div');
        el.className = 'flex items-center gap-3 p-2 hover:bg-gray-700/50 rounded-xl transition-colors';
        el.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold ${colorClass.replace('text-', 'bg-').replace('-400', '-500/20')} ${colorClass}">
                ${user.charAt(0).toUpperCase()}
            </div>
            <span class="font-medium text-sm flex-1 ${isMe ? 'text-purple-400' : 'text-gray-200'}">${user}${isMe ? ' (You)' : ''}</span>
            ${isMe ? '' : '<div class="w-2 h-2 rounded-full bg-green-500"></div>'}
        `;
        chatArea.usersList.appendChild(el);
    });
}

// Messaging
chatArea.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = inputs.message.value.trim();

    if (content && stompClient) {
        const message = {
            sender: currentUsername,
            content: content,
            type: 'CHAT'
        };

        stompClient.send(`/app/chat/${currentRoom}/sendMessage`, {}, JSON.stringify(message));
        inputs.message.value = '';

        // Clear typing
        isTyping = false;
        clearTimeout(typingTimer);
        stompClient.send(`/app/chat/${currentRoom}/typing`, {}, JSON.stringify({ sender: currentUsername, type: 'TYPING', content: 'false' }));
    }
});

// Typing indicator logic
inputs.message.addEventListener('input', () => {
    if (!stompClient || !currentRoom) return;

    if (!isTyping) {
        isTyping = true;
        stompClient.send(`/app/chat/${currentRoom}/typing`, {}, JSON.stringify({ sender: currentUsername, type: 'TYPING', content: 'true' }));
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        stompClient.send(`/app/chat/${currentRoom}/typing`, {}, JSON.stringify({ sender: currentUsername, type: 'TYPING', content: 'false' }));
    }, 1500);
});

let typingUsers = new Set();

function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);

    // Update user count and list if present
    if (message.userCount !== undefined) {
        chatArea.userCount.innerText = `${message.userCount} user${message.userCount > 1 ? 's' : ''} online`;
    }
    if (message.activeUsers) {
        lastActiveUsers = message.activeUsers;
        if (!chatArea.usersModal.classList.contains('hidden')) {
            updateUsersListUI();
        }
    }

    if (message.type === 'JOIN') {
        appendSystemMessage(`${message.sender} joined the room`, 'text-green-400');
    } else if (message.type === 'LEAVE') {
        appendSystemMessage(`${message.sender} left the room`, 'text-gray-500');
        // Remove from typing if they left while typing
        typingUsers.delete(message.sender);
        updateTypingDisplay();
    } else if (message.type === 'TYPING') {
        if (message.sender !== currentUsername) {
            if (message.content === 'true') {
                typingUsers.add(message.sender);
            } else {
                typingUsers.delete(message.sender);
            }
            updateTypingDisplay();
        }
    } else if (message.type === 'CHAT') {
        // Clear this user from typing
        typingUsers.delete(message.sender);
        updateTypingDisplay();

        appendChatMessage(message);
    }
}

function updateTypingDisplay() {
    if (typingUsers.size === 0) {
        chatArea.typingIndicator.style.opacity = '0';
        chatArea.typingIndicator.innerHTML = '';
    } else {
        const users = Array.from(typingUsers);
        let text = users.length === 1 ? `${users[0]} is typing` :
            users.length === 2 ? `${users[0]} and ${users[1]} are typing` :
                `${users.length} people are typing`;

        chatArea.typingIndicator.innerHTML = `${text} <span class="typing-dots"><span></span><span></span><span></span></span>`;
        chatArea.typingIndicator.style.opacity = '1';
    }
}

function appendSystemMessage(text, colorClass) {
    const el = document.createElement('div');
    el.className = `flex justify-center system-msg-enter mt-2 mb-2`;
    el.innerHTML = `
        <span class="bg-gray-800/80 rounded-full px-4 py-1.5 text-xs ${colorClass} font-medium border border-gray-700/50 shadow-sm">
            ${text}
        </span>
    `;
    chatArea.messages.appendChild(el);
    scrollToBottom();
}

function appendChatMessage(message) {
    const isMe = message.sender === currentUsername;
    const el = document.createElement('div');
    const colorClass = getUserColor(message.sender);

    el.className = `flex flex-col w-full ${isMe ? 'items-end' : 'items-start'} ${isMe ? 'msg-enter-right' : 'msg-enter-left'}`;

    if (isMe) {
        el.innerHTML = `
            <div class="flex flex-col max-w-[80%]">
                <div class="msg-bubble bg-purple-600 text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-md shadow-purple-900/20">
                    <p class="text-sm leading-relaxed">${escapeHTML(message.content)}</p>
                </div>
            </div>
        `;
    } else {
        el.innerHTML = `
            <div class="flex flex-col max-w-[80%]">
                <span class="text-xs ${colorClass} font-bold mb-1 ml-2 tracking-wide">${message.sender}</span>
                <div class="msg-bubble bg-gray-800 border border-gray-700 text-gray-100 rounded-2xl rounded-tl-sm px-5 py-3">
                    <p class="text-sm leading-relaxed">${escapeHTML(message.content)}</p>
                </div>
            </div>
        `;
    }

    chatArea.messages.appendChild(el);
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        chatArea.messages.scrollTo({
            top: chatArea.messages.scrollHeight + 100,
            behavior: 'smooth'
        });
    }, 100);
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Input formatting
inputs.roomCode.addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
