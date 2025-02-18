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
    
    // 获取DOM元素
    const toggleButton = document.getElementById('toggleCapture');
    const clearButton = document.getElementById('clearData');
    const commentsList = document.getElementById('comments');
    const liveIdSpan = document.getElementById('liveId');
    const apiUrlDiv = document.getElementById('apiUrl');
    const apiResponseDiv = document.getElementById('apiResponse');
    
    // 捕获状态
    let isCapturing = false;

    // 更新按钮状态
    function updateButtonState() {
        if (toggleButton) {
            toggleButton.textContent = isCapturing ? '停止捕获' : '开始捕获';
            toggleButton.className = isCapturing ? 'active' : '';
        }
    }

    // 清除所有数据
    function clearAllData() {
        if (commentsList) commentsList.innerHTML = '';
        if (liveIdSpan) liveIdSpan.textContent = '等待获取...';
        if (apiUrlDiv) apiUrlDiv.textContent = '';
        if (apiResponseDiv) apiResponseDiv.textContent = '';
        chrome.storage.local.clear();
    }

    // 添加评论
    function addComment(comment) {
        if (!commentsList) return;

        const div = document.createElement('div');
        div.className = 'comment';
        
        const nickname = comment.sender;
        const token = comment.userToken;
        
        div.innerHTML = `
            <div class="comment-header">
                <span class="time">[${comment.time}]</span>
                <span class="sender">${nickname}</span>
                ${token ? `<span class="user-token">[${token}]</span>` : ''}
            </div>
            <span class="content">${comment.content}</span>
        `;
        
        // 在最前面插入新评论
        if (commentsList.firstChild) {
            commentsList.insertBefore(div, commentsList.firstChild);
        } else {
            commentsList.appendChild(div);
        }
        
        // 限制显示的评论数量
        const maxComments = 1000;
        while (commentsList.children.length > maxComments) {
            commentsList.removeChild(commentsList.lastChild);
        }
    }

    // 绑定按钮事件
    if (toggleButton) {
        toggleButton.addEventListener('click', function() {
            if (!isCapturing) {
                chrome.runtime.sendMessage({action: 'startCapture'}, function(response) {
                    if (response && response.success) {
                        console.log('开始捕获消息发送成功');
                        isCapturing = true;
                        updateButtonState();
                    }
                });
            } else {
                chrome.runtime.sendMessage({action: 'stopCapture'}, function(response) {
                    if (response && response.success) {
                        console.log('停止捕获消息发送成功');
                        isCapturing = false;
                        updateButtonState();

                        // 保存评论数据到localStorage
                        try {
                            const commentsHtml = commentsList.innerHTML;
                            chrome.storage.local.set({ 'savedComments': commentsHtml });
                        } catch (error) {
                            console.error('保存评论失败:', error);
                        }
                    }
                });
            }
        });
    }

    // 绑定清除按钮事件
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (confirm('确定要清除所有数据吗？')) {
                clearAllData();
            }
        });
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('popup收到消息:', message);
        if (message.type === 'newComment' && message.data) {
            addComment(message.data);
        } else if (message.type === 'liveInfo' && message.data) {
            if (liveIdSpan) liveIdSpan.textContent = message.data.liveId || '未知';
        } else if (message.type === 'apiUrl' && message.url) {
            if (apiUrlDiv) apiUrlDiv.textContent = message.url;
        } else if (message.type === 'apiResponse' && message.data) {
            if (apiResponseDiv) apiResponseDiv.textContent = message.data.response || '';
        }
    });

    // 恢复保存的评论
    chrome.storage.local.get(['savedComments'], function(result) {
        if (result.savedComments && commentsList) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = result.savedComments;
            // 反转评论顺序
            const comments = Array.from(tempDiv.children);
            comments.reverse().forEach(comment => {
                commentsList.appendChild(comment);
            });
        }
    });
});
