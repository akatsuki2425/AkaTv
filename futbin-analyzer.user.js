// ==UserScript==
// @name         FUTBIN Price Analyzer (UI Integration)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  تحليل أسعار FUTBIN + RSI + اتجاه السوق + توصيات ذكية
// @author       YourName
// @match        https://www.futbin.com/*
// @grant        none
// @license      MIT
// @icon         https://www.futbin.com/favicon.ico
// @downloadURL  https://yourdomain.com/path/futbin-analyzer.user.js
// @updateURL    https://yourdomain.com/path/futbin-analyzer.user.js
// ==/UserScript==

(function () {
    'use strict';

    function calculateRSI(data, period = 14) {
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i][1] - data[i - 1][1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        const avgGain = gains / period;
        const avgLoss = losses / period || 1; // avoid divide by zero
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        return rsi.toFixed(2);
    }

    function getMarketTrend(prices) {
        const recent = prices.slice(-5);
        let trendScore = 0;

        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i - 1]) trendScore++;
            else if (recent[i] < recent[i - 1]) trendScore--;
        }

        if (trendScore >= 3) return "🔼 صاعد";
        else if (trendScore <= -3) return "🔽 هابط";
        else return "🔁 جانبي";
    }

    function analyzePrices(data) {
        const prices = data.map(d => d[1]).filter(p => p > 0);
        const latest = prices[prices.length - 1];
        const highest = Math.max(...prices);
        const lowest = Math.min(...prices);
        const average = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
        const deviation = ((latest - average) / average * 100).toFixed(2);
        const rsi = prices.length >= 15 ? calculateRSI(data.slice(-15)) : "N/A";
        const trend = getMarketTrend(prices);

        let advice = "⚪ لا توجد توصية";
        if (rsi !== "N/A") {
            const rsiVal = parseFloat(rsi);
            if (rsiVal < 30) advice = "🟢 فرصة شراء (Oversold)";
            else if (rsiVal > 70) advice = "🔴 فرصة بيع (Overbought)";
        }

        return { latest, highest, lowest, average, deviation, rsi, trend, advice };
    }

    function insertResultBox(result) {
        const target = document.querySelector('.highcharts-graph-wrapper');
        if (!target) return;

        const existing = document.getElementById('price-analyzer-box');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.id = 'price-analyzer-box';
        box.style.marginTop = '20px';
        box.style.padding = '15px';
        box.style.border = '2px solid';
        box.style.borderRadius = '8px';
        box.style.backgroundColor = '#f1f9ff';
        box.style.fontSize = '14px';
        box.style.color = '#000';
        box.style.lineHeight = '1.6';

        // لون الإطار حسب RSI
        if (result.rsi !== "N/A") {
            const rsiVal = parseFloat(result.rsi);
            if (rsiVal < 30) box.style.borderColor = "#28a745"; // أخضر
            else if (rsiVal > 70) box.style.borderColor = "#dc3545"; // أحمر
            else box.style.borderColor = "#007bff"; // أزرق
        }

        box.innerHTML = `
            <h3 style="margin-bottom: 10px;">📊 تحليل أسعار PS</h3>
            <ul style="list-style: none; padding: 0;">
                <li>🔸 <strong>آخر سعر:</strong> ${result.latest}</li>
                <li>🔺 <strong>أعلى سعر:</strong> ${result.highest}</li>
                <li>🔻 <strong>أدنى سعر:</strong> ${result.lowest}</li>
                <li>📈 <strong>متوسط السعر:</strong> ${result.average}</li>
                <li>⚖️ <strong>الانحراف عن المتوسط:</strong> ${result.deviation}%</li>
                <li>🧮 <strong>RSI (14):</strong> ${result.rsi}</li>
                <li>📌 <strong>التوصية:</strong> ${result.advice}</li>
                <li>📊 <strong>اتجاه السوق:</strong> ${result.trend}</li>
            </ul>
        `;

        target.parentElement.appendChild(box);
    }

    function analyzeAndInsert() {
        const graphDiv = document.querySelector('.highcharts-graph-wrapper');
        if (!graphDiv) return;

        try {
            const psData = JSON.parse(graphDiv.getAttribute('data-ps-data'));
            const result = analyzePrices(psData);
            insertResultBox(result);
        } catch (e) {
            console.warn("❌ فشل في تحليل البيانات:", e);
        }
    }

    window.addEventListener('load', () => {
        analyzeAndInsert();
        setInterval(analyzeAndInsert, 60000); // تحديث كل دقيقة
    });
})();
