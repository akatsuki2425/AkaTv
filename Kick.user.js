// ==UserScript==
// @name         Kick Viewer Analyzer (On-Screen Overlay)
// @namespace    https://kick.com/
// @version      1.2
// @description  Show real viewer analysis overlay for Kick.com streams.
// @match        https://kick.com/*
// @icon         https://kick.com/favicon.ico
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/Kick.user.js
// @updateURL    https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/Kick.user.js
// ==/UserScript==
// ==/UserScript==

(function () {
    'use strict';

    const statsBox = document.createElement('div');
    statsBox.style = `
        position: fixed; top: 10px; left: 10px; z-index: 9999;
        background: rgba(0,0,0,0.85); color: white;
        padding: 10px; border-radius: 8px;
        font-family: Arial; font-size: 14px;
    `;
    document.body.appendChild(statsBox);

    function extractViewerCount() {
        const container = document.querySelector('[data-testid="viewer-count"]');
        if (!container) return null;

        const digitBlocks = container.querySelectorAll('div.flex.overflow-hidden');
        if (!digitBlocks.length) return null;

        let number = '';
        digitBlocks.forEach(block => {
            const visibleDigit = Array.from(block.children).find(child => {
                const transform = window.getComputedStyle(child).transform;
                return transform && transform.includes('translateY(0') || transform === 'none';
            });
            if (visibleDigit) {
                number += visibleDigit.textContent.trim();
            } else {
                // fallback: pick first number
                number += block.children[0]?.textContent.trim() || '0';
            }
        });

        return parseInt(number.replace(/\D/g, '')) || 0;
    }

    function analyze() {
        const viewers = extractViewerCount();
        if (!viewers) {
            statsBox.textContent = '❌ Viewer count not found or not yet loaded.';
            return;
        }

        const usernames = new Set([...document.querySelectorAll('.chat-message .username')].map(e => e.textContent.trim()));
        const real = usernames.size;
        const fake = Math.max(viewers - real, 0);
        const percent = viewers > 0 ? ((real / viewers) * 100).toFixed(1) : 0;

        let color = '#00ff99';
        if (percent < 30) color = '#ff4d4d';
        else if (percent < 60) color = '#ffaa00';

        statsBox.style.color = color;
        statsBox.innerHTML = `
            👁️ ${viewers} total<br>
            💬 ${real} chatting<br>
            🤖 ${fake} possibly bots<br>
            ✅ ${percent}% real viewers
        `;
    }

    setTimeout(analyze, 8000);
    setInterval(analyze, 30000);
})();
