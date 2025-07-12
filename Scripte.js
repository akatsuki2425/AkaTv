 // ==UserScript==
// @name         FUTBIN Price Analyzer (UI Integration)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  تحليل أسعار FUTBIN + RSI وإظهاره في الصفحة
// @match        https://www.futbin.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function calculateRSI(data, period = 14) {
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i][1] - data[i - 1][1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        return rsi.toFixed(2);
    }

    function analyzePrices(data) {
        const prices = data.map(d => d[1]).filter(p => p > 0);
        const latest = prices[prices.length - 1];
        const highest = Math.max(...prices);
        const lowest = Math.min(...prices);
        const average = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
        const rsi = prices.length >= 15 ? calculateRSI(data.slice(-15)) : "N/A";

        return { latest, highest, lowest, average, rsi };
    }

    function insertResultBox(result) {
        const target = document.querySelector('.highcharts-graph-wrapper');
        if (!target) return;

        const box = document.createElement('div');
        box.style.marginTop = '20px';
        box.style.padding = '15px';
        box.style.border = '2px solid #007bff';
        box.style.borderRadius = '8px';
        box.style.backgroundColor = '#f1f9ff';
        box.style.fontSize = '14px';
        box.style.color = '#000';
        box.style.lineHeight = '1.6';
        box.innerHTML = `
            <h3 style="margin-bottom: 10px;">📊 تحليل أسعار PS</h3>
            <ul style="list-style: none; padding: 0;">
                <li>🔸 <strong>آخر سعر:</strong> ${result.latest}</li>
                <li>🔺 <strong>أعلى سعر:</strong> ${result.highest}</li>
                <li>🔻 <strong>أدنى سعر:</strong> ${result.lowest}</li>
                <li>📈 <strong>متوسط السعر:</strong> ${result.average}</li>
                <li>🧮 <strong>RSI (14):</strong> ${result.rsi}</li>
            </ul>
        `;

        target.parentElement.appendChild(box);
    }

    window.addEventListener('load', function () {
        const graphDiv = document.querySelector('.highcharts-graph-wrapper');

        if (graphDiv) {
            try {
                const psData = JSON.parse(graphDiv.getAttribute('data-ps-data'));
                const result = analyzePrices(psData);
                insertResultBox(result);
            } catch (e) {
                console.warn("❌ فشل في تحليل البيانات:", e);
            }
        } else {
            console.warn("⚠️ لم يتم العثور على مخطط الأسعار");
        }
    });
})();
