// 检查是否已经注入
if (window.hasOwnProperty('__TAOBAO_LIVE_HELPER_INJECT_LOADED__')) {
    console.log('注入脚本已加载，跳过');
} else {
    // 标记为已注入
    window.__TAOBAO_LIVE_HELPER_INJECT_LOADED__ = true;

    console.log('注入脚本开始加载');

    // 创建一个全局对象来存储状态
    window.__TAOBAO_LIVE_HELPER__ = {
        lastUrl: null,
        callbacks: {}
    };

    // 在页面中注入JSONP处理函数
    const script = document.createElement('script');
    script.textContent = `
        // 定义全局处理函数
        window.__processJSONPResponse = function(data) {
            console.log('处理JSONP响应');
            window.postMessage({
                type: 'JSONP_RESPONSE',
                data: data
            }, '*');
        };

        // 定义代理创建函数
        window.__createCallbackProxy = function(callbackName) {
            const originalCallback = window[callbackName];
            window[callbackName] = function(data) {
                console.log('JSONP回调被调用:', callbackName);
                if (originalCallback) {
                    originalCallback(data);
                }
                window.__processJSONPResponse(data);
            };
        };
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // 监听script标签的创建
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'SCRIPT') {
                    const src = node.src;
                    if (src && src.includes('mtop.taobao.iliad.comment.query.latest')) {
                        console.log('发现新的JSONP请求:', src);
                        // 提取callback参数
                        const match = src.match(/callback=(mtopjsonp\d+)/);
                        if (match) {
                            const callbackName = match[1];
                            console.log('找到callback:', callbackName);
                            // 创建代理
                            const injectScript = document.createElement('script');
                            injectScript.textContent = `window.__createCallbackProxy('${callbackName}');`;
                            document.head.appendChild(injectScript);
                            injectScript.remove();
                        }
                        // 发送URL到content script
                        window.postMessage({
                            type: 'CAPTURED_URL',
                            url: src
                        }, '*');
                    }
                }
            });
        });
    });

    // 观察document的变化
    observer.observe(document, {
        childList: true,
        subtree: true
    });

    // 监听URL变化
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
        const element = originalCreateElement.call(document, tagName);
        if (tagName.toLowerCase() === 'script') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'src' && value.includes('mtop.taobao.iliad.comment.query.latest')) {
                    console.log('捕获到JSONP URL:', value);
                    window.postMessage({
                        type: 'CAPTURED_URL',
                        url: value
                    }, '*');
                }
                return originalSetAttribute.call(this, name, value);
            };
        }
        return element;
    };

    console.log('注入脚本加载完成');
}
