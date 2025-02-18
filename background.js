let isCapturing = false;
let processedComments = new Set();
let lastRequestTime = 0;
let currentLiveId = null;
const REQUEST_INTERVAL = 2000; // 最小请求间隔（毫秒）

console.log('Background script loaded');

// 用于存储各个标签页的状态
const tabStates = new Map();

// 检查content script是否已注入
async function ensureContentScriptInjected(tabId) {
    try {
        // 尝试注入content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        console.log('Content script注入成功');
        return true;
    } catch (error) {
        if (error.message.includes('Cannot access contents of url')) {
            console.log('无法在此页面注入content script');
            return false;
        }
        if (!error.message.includes('The content script has already been injected')) {
            console.error('注入content script失败:', error);
            return false;
        }
        return true;
    }
}

// 发送消息到content script
async function sendMessageToContentScript(tabId, message) {
    try {
        // 确保content script已注入
        const isInjected = await ensureContentScriptInjected(tabId);
        if (!isInjected) {
            console.log('Content script未注入，跳过消息发送');
            return;
        }

        // 发送消息
        await chrome.tabs.sendMessage(tabId, message);
        console.log('消息发送成功:', message);
    } catch (error) {
        console.error('发送消息失败:', error);
    }
}

// 从URL中提取直播间ID
function extractLiveId(url) {
    try {
        const dataParam = new URL(url).searchParams.get('data');
        if (dataParam) {
            const data = JSON.parse(decodeURIComponent(dataParam));
            return data.topic || null;
        }
    } catch (error) {
        console.error('提取直播间ID失败:', error);
    }
    return null;
}

// 直接获取数据
async function fetchData(url) {
    try {
        console.log('开始获取数据:', url);
        const response = await fetch(url);
        const text = await response.text();
        
        // 提取JSON数据
        const match = text.match(/mtopjsonp\d+\((.*)\)/);
        if (match) {
            const jsonData = JSON.parse(match[1]);
            console.log('解析数据成功');
            return jsonData;
        }
        return null;
    } catch (error) {
        console.error('获取数据失败:', error);
        return null;
    }
}

// 检查评论是否已处理
function isCommentProcessed(comment) {
    const key = `${comment.timestamp}_${comment.content}_${comment.tbNick || comment.publisherNick}`;
    if (processedComments.has(key)) {
        return true;
    }
    processedComments.add(key);
    // 保持集合大小在合理范围内
    if (processedComments.size > 1000) {
        const iterator = processedComments.values();
        for (let i = 0; i < 500; i++) {
            processedComments.delete(iterator.next().value);
        }
    }
    return false;
}

// 更新直播间ID
function updateLiveId(newLiveId) {
    if (newLiveId && newLiveId !== currentLiveId) {
        currentLiveId = newLiveId;
        chrome.runtime.sendMessage({
            type: 'liveInfo',
            data: { liveId: currentLiveId }
        });
        console.log('更新直播间ID:', currentLiveId);
    }
}

// 监听插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    console.log('插件图标被点击');
    try {
        const popup = await chrome.windows.create({
            url: chrome.runtime.getURL('popup.html'),
            type: 'popup',
            width: 500,
            height: 600
        });
        console.log('创建弹出窗口成功:', popup.id);
    } catch (error) {
        console.error('创建弹出窗口失败:', error);
    }
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
});

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
    async function(details) {
        if (!isCapturing || !details.url.includes('mtop.taobao.iliad.comment.query.latest')) {
            return;
        }

        const currentTime = Date.now();
        if (currentTime - lastRequestTime < REQUEST_INTERVAL) {
            console.log('请求太频繁，跳过');
            return;
        }
        lastRequestTime = currentTime;

        console.log('捕获到API请求:', details.url);
        
        // 提取并更新直播间ID
        const liveId = extractLiveId(details.url);
        if (liveId && liveId !== currentLiveId) {
            currentLiveId = liveId;
            chrome.runtime.sendMessage({
                type: 'liveInfo',
                data: { liveId: currentLiveId }
            });
        }

        // 发送URL到popup
        chrome.runtime.sendMessage({
            type: 'apiUrl',
            url: details.url
        });

        // 直接获取数据
        const data = await fetchData(details.url);
        if (data && data.data?.comments?.length > 0) {
            console.log('发送数据到popup');
            chrome.runtime.sendMessage({
                type: 'apiResponse',
                data: {
                    url: details.url,
                    response: JSON.stringify(data, null, 2)
                }
            });

            // 处理评论
            const newComments = data.data.comments.filter(comment => 
                comment.content && 
                comment.content.trim() && 
                !isCommentProcessed(comment)
            );

            if (newComments.length > 0) {
                console.log('发现新评论:', newComments.length);
                
                // 获取第一条评论的直播间ID
                if (newComments[0].renders?.liveId) {
                    updateLiveId(newComments[0].renders.liveId);
                }

                newComments.forEach(comment => {
                    const timestamp = new Date(parseInt(comment.timestamp));
                    const time = timestamp.toLocaleTimeString();
                    const nickname = comment.tbNick || comment.publisherNick;
                    const userToken = comment.userToken || comment.renders?.userToken || '';
                    const liveId = comment.renders?.liveId || currentLiveId;
                    
                    chrome.runtime.sendMessage({
                        type: 'newComment',
                        data: {
                            sender: nickname,
                            userToken: userToken,
                            time: time,
                            content: comment.content.trim(),
                            liveId: liveId
                        }
                    });
                });
            } else {
                console.log('没有新评论');
            }
        }
    },
    {
        urls: [
            "*://*.taobao.com/*",
            "*://*.alicdn.com/*",
            "*://*.h5api.m.taobao.com/*"
        ]
    },
    ["requestBody"]
);

// 全局变量
let ws = null;
let connectionDisabled = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// 消息去重
const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 1000;

// 生成消息ID
function generateMessageId(message) {
    return `${message.content}_${message.time}_${message.sender}_${message.userToken}`;
}

// 清理过期消息ID
function cleanupProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        const messagesArray = Array.from(processedMessages);
        const keepMessages = messagesArray.slice(Math.floor(messagesArray.length / 2));
        processedMessages.clear();
        keepMessages.forEach(id => processedMessages.add(id));
    }
}

// 检查消息是否重复
function isDuplicateMessage(message) {
    const messageId = generateMessageId(message);
    if (processedMessages.has(messageId)) {
        console.log('跳过重复消息:', message.content);
        return true;
    }
    processedMessages.add(messageId);
    cleanupProcessedMessages();
    return false;
}

// 发送消息到popup
function sendToPopup(message) {
    try {
        chrome.runtime.sendMessage({
            type: 'newComment',
            data: message
        }).catch(error => {
            // 忽略接收端不存在的错误
            if (!error.message.includes('Could not establish connection')) {
                console.error('发送消息到popup失败:', error);
            }
        });
    } catch (error) {
        console.error('发送消息到popup失败:', error);
    }
}

// 发送消息到WebSocket服务器
function sendToServer(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log('WebSocket未连接，无法发送消息');
        return false;
    }

    try {
        // 构造发送到Python后端的消息格式
        const serverMessage = {
            type: 'danmu',
            data: {
                content: message.content,
                nickname: message.sender,
                time: message.time,
                liveId: message.liveId,
                userToken: message.userToken
            }
        };
        
        console.log('发送到Python服务器的消息:', serverMessage);
        ws.send(JSON.stringify(serverMessage));
        return true;
    } catch (error) {
        console.error('发送消息失败:', error);
        return false;
    }
}

// 连接WebSocket
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        console.log('WebSocket已经连接或正在连接中');
        return;
    }

    if (connectionDisabled) {
        console.log('WebSocket连接已被禁用');
        return;
    }

    try {
        ws = new WebSocket('ws://127.0.0.1:8765');

        ws.onopen = function() {
            console.log('WebSocket连接成功');
            reconnectAttempts = 0;
        };

        ws.onclose = function() {
            console.log('WebSocket连接关闭');
            ws = null;

            if (!connectionDisabled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                console.log(`尝试重新连接 (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                reconnectAttempts++;
                setTimeout(connectWebSocket, 1000);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.log('达到最大重连次数，停止重连');
                connectionDisabled = true;
            }
        };

        ws.onerror = function(error) {
            console.error('WebSocket错误:', error);
        };

        ws.onmessage = function(event) {
            console.log('收到服务器消息:', event.data);
        };
    } catch (error) {
        console.error('创建WebSocket连接失败:', error);
    }
}

// 关闭WebSocket连接
function closeWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
    connectionDisabled = true;
    console.log('WebSocket连接已关闭');
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background收到消息:', message);
    
    if (message.type === 'startCapture') {
        console.log('收到开始捕获命令');
        
        // 清空消息记录
        processedMessages.clear();
        
        // 启动WebSocket连接
        connectionDisabled = false;
        reconnectAttempts = 0;
        connectWebSocket();
        
        chrome.tabs.query({url: ["*://*.taobao.com/*", "*://*.tmall.com/*"]}).then(tabs => {
            if (tabs.length === 0) {
                console.log('未找到淘宝直播标签页');
                sendResponse({ status: 'error', error: '请先打开淘宝直播页面' });
                return;
            }
            
            // 注入脚本到所有标签页
            tabs.forEach(async tab => {
                try {
                    // 先注入content script
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    // 发送开始捕获命令
                    await chrome.tabs.sendMessage(tab.id, { 
                        type: 'startCapture' 
                    });
                    console.log(`标签页 ${tab.id} 开始捕获成功`);
                    
                } catch (error) {
                    console.error(`处理标签页 ${tab.id} 时出错:`, error);
                }
            });
            
            sendResponse({ status: 'success' });
        }).catch(error => {
            console.error('处理开始捕获命令时出错:', error);
            sendResponse({ status: 'error', error: error.message });
        });
        
        return true;
    }
    
    if (message.type === 'stopCapture') {
        console.log('收到停止捕获命令');
        
        // 关闭WebSocket连接
        closeWebSocket();
        
        chrome.tabs.query({url: ["*://*.taobao.com/*", "*://*.tmall.com/*"]}).then(tabs => {
            // 发送停止命令到所有标签页
            tabs.forEach(async tab => {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'stopCapture' });
                    console.log(`标签页 ${tab.id} 停止捕获成功`);
                } catch (error) {
                    console.error(`向标签页 ${tab.id} 发送停止命令时出错:`, error);
                }
            });
            
            sendResponse({ status: 'success' });
        }).catch(error => {
            console.error('处理停止捕获命令时出错:', error);
            sendResponse({ status: 'error', error: error.message });
        });
        
        return true;
    }

    if (message.type === 'newComment') {
        console.log('收到新评论');
        
        // 如果连接被禁用，提示用户手动启动服务
        if (connectionDisabled) {
            sendResponse({ 
                success: false, 
                error: 'WebSocket连接已禁用，请重新开始捕获' 
            });
            return true;
        }

        // 检查是否是重复消息
        if (isDuplicateMessage(message.data)) {
            sendResponse({ success: true });
            return true;
        }

        // 发送到popup
        sendToPopup(message.data);
        
        // 发送到服务器
        const success = sendToServer(message.data);
        sendResponse({ success: success });
        return true;
    }
});

// 保持service worker活跃
function keepAlive() {
    chrome.runtime.getPlatformInfo(function(info) {});
    setTimeout(keepAlive, 20000);
}
keepAlive();
