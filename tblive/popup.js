let isCapturing = false;
let commentCount = 0;

// 格式化JSON字符串
function formatJSON(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        console.error('JSON格式化失败:', e);
        return jsonStr;
    }
}

// 发送消息到background script
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) {
                    console.error('发送消息失败:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        } catch (error) {
            console.error('发送消息时出错:', error);
            reject(error);
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('popup页面加载完成');
    
    // 初始化状态
    let isCapturing = false;
    const processedMessageIds = new Set();
    const maxMessages = 100; // 最大显示消息数量
    
    // 获取DOM元素
    const toggleButton = document.getElementById('toggleCapture');
    const clearButton = document.getElementById('clearData');
    const commentsList = document.getElementById('comments');
    const liveIdSpan = document.getElementById('liveId');
    const apiUrlDiv = document.getElementById('apiUrl');
    const apiResponseDiv = document.getElementById('apiResponse');
    
    // 生成消息ID
    function generateMessageId(message) {
        return `${message.content}_${message.time}_${message.sender}`;
    }

    // 清理旧消息
    function cleanupOldMessages() {
        while (commentsList.children.length > maxMessages) {
            commentsList.removeChild(commentsList.lastChild);
        }
        
        // 清理已处理消息ID集合
        if (processedMessageIds.size > maxMessages * 2) {
            const messageIds = Array.from(processedMessageIds);
            processedMessageIds.clear();
            messageIds.slice(-maxMessages).forEach(id => processedMessageIds.add(id));
        }
    }

    // 添加消息到列表
    function addMessageToList(message) {
        const messageId = generateMessageId(message);
        
        // 检查消息是否已经显示
        if (processedMessageIds.has(messageId)) {
            console.log('跳过重复消息:', message);
            return;
        }
        
        // 记录消息ID
        processedMessageIds.add(messageId);

        const div = document.createElement('div');
        div.className = 'comment';
        
        const nickname = message.sender;
        const token = message.userToken;
        
        div.innerHTML = `
            <div class="comment-header">
                <span class="time">[${message.time}]</span>
                <span class="sender">${nickname}</span>
                ${token ? `<span class="user-token">[${token}]</span>` : ''}
            </div>
            <span class="content">${message.content}</span>
        `;
        
        // 在列表顶部插入新消息
        if (commentsList.firstChild) {
            commentsList.insertBefore(div, commentsList.firstChild);
        } else {
            commentsList.appendChild(div);
        }
        
        // 清理旧消息
        cleanupOldMessages();
    }

    // 清空消息列表
    function clearMessageList() {
        commentsList.innerHTML = '';
        processedMessageIds.clear();
    }

    // 更新按钮状态
    function updateButtonState() {
        if (toggleButton) {
            toggleButton.textContent = isCapturing ? '停止捕获' : '开始捕获';
            toggleButton.className = isCapturing ? 'active' : '';
        }
    }

    // 绑定按钮事件
    if (toggleButton) {
        toggleButton.addEventListener('click', async function() {
            try {
                if (!isCapturing) {
                    // 开始捕获
                    console.log('正在开始捕获...');
                    const response = await sendMessage({ type: 'startCapture' });
                    if (response.status === 'success') {
                        isCapturing = true;
                        updateButtonState();
                        console.log('开始捕获成功');
                        clearMessageList(); // 清空之前的消息
                    } else {
                        console.error('开始捕获失败:', response.error);
                    }
                } else {
                    // 停止捕获
                    console.log('正在停止捕获...');
                    const response = await sendMessage({ type: 'stopCapture' });
                    if (response.status === 'success') {
                        isCapturing = false;
                        updateButtonState();
                        console.log('停止捕获成功');
                    } else {
                        console.error('停止捕获失败:', response.error);
                    }
                }
            } catch (error) {
                console.error('切换捕获状态时出错:', error);
            }
        });
    }

    // 绑定清除按钮事件
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            clearMessageList();
            if (liveIdSpan) liveIdSpan.textContent = '等待获取...';
            if (apiUrlDiv) apiUrlDiv.textContent = '';
            if (apiResponseDiv) apiResponseDiv.textContent = '';
            chrome.storage.local.clear();
        });
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'apiResponse') {
            if (apiUrlDiv) apiUrlDiv.textContent = message.data.url;
            if (apiResponseDiv) apiResponseDiv.textContent = formatJSON(message.data.response);
            
            // 提取直播ID
            try {
                const url = new URL(message.data.url);
                const liveId = url.searchParams.get('liveId');
                if (liveId && liveIdSpan) {
                    liveIdSpan.textContent = liveId;
                }
            } catch (e) {
                console.error('解析URL失败:', e);
            }
        } else if (message.type === 'newComment') {
            if (!isCapturing) {
                console.log('未开启捕获，忽略消息');
                return;
            }
            addMessageToList(message.data);
            commentCount++;
            const countElement = document.getElementById('commentCount');
            if (countElement) {
                countElement.textContent = `已捕获 ${commentCount} 条弹幕`;
            }
        }
    });

    // 恢复捕获状态
    chrome.storage.local.get(['isCapturing'], function(result) {
        if (result.isCapturing) {
            isCapturing = true;
            updateButtonState();
        }
    });
});
