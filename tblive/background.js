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

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background收到消息:', message, '来自:', sender);

    try {
        if (message.action === 'startCapture') {
            console.log('开始捕获');
            isCapturing = true;
            processedComments.clear(); // 清空已处理评论集合
            lastRequestTime = 0; // 重置请求时间
            // 发送当前直播间ID（如果有）
            if (currentLiveId) {
                chrome.runtime.sendMessage({
                    type: 'liveInfo',
                    data: { liveId: currentLiveId }
                });
            }
            sendResponse({success: true});
        } else if (message.action === 'stopCapture') {
            console.log('停止捕获');
            isCapturing = false;
            sendResponse({success: true});
        } else if (message.type === 'apiUrl') {
            console.log('收到API URL:', message.url);
            // 广播消息到所有监听者
            broadcastMessage(message);
            sendResponse({ success: true });
        } else if (message.type === 'apiResponse') {
            console.log('收到API响应');
            // 广播消息到所有监听者
            broadcastMessage(message);
            sendResponse({ success: true });
        } else if (message.type === 'newComment') {
            console.log('收到新评论');
            // 广播消息到所有监听者
            broadcastMessage(message);
            sendResponse({ success: true });
        } else if (message.type === 'liveInfo') {
            console.log('收到直播间信息');
            // 广播消息到所有监听者
            broadcastMessage(message);
            sendResponse({ success: true });
        }
    } catch (error) {
        console.error('处理消息时出错:', error);
        sendResponse({ success: false, error: error.message });
    }

    return true; // 保持消息通道开放
});

// 广播消息到所有相关的接收者
function broadcastMessage(message) {
    chrome.runtime.sendMessage(message).catch(error => {
        // 忽略接收端不存在的错误
        if (!error.message.includes('Could not establish connection')) {
            console.error('广播消息失败:', error);
        }
    });
}

// 保持service worker活跃
const keepAlive = () => {
    console.log('Background保持活跃');
    setTimeout(keepAlive, 20000);
};
keepAlive();
