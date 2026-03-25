const API = "http://127.0.0.1:5000";

// DOM Elements
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

let stream;
let interval;
let chartInstance;

// Colors for emotions
const emotionColors = {
    angry: '#ef4444', disgust: '#84cc16', fear: '#a855f7',
    happy: '#eab308', sad: '#3b82f6', surprise: '#f97316', neutral: '#94a3b8'
};

// --- CAMERA CONTROLS ---

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            video.play();
            // Sync canvas resolution to actual video resolution
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            
            // Capture a frame every 1 second
            interval = setInterval(sendFrame, 1000);
        };
    } catch (err) {
        console.error("Camera error:", err);
        alert("Could not access camera. Check permissions.");
    }
}

function stopCamera() {
    clearInterval(interval);
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    document.getElementById("liveEmotion").innerText = "-";
    document.getElementById("liveScore").innerText = "0";
    document.getElementById("liveVerdict").innerText = "-";
}

// --- LIVE FRAME ANALYSIS ---

function sendFrame() {
    if (video.videoWidth === 0) return;

    // Draw current video frame to a temporary canvas
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const tempCtx = canvas.getContext("2d");
    tempCtx.drawImage(video, 0, 0);

    // Convert to JPEG and send to API
    canvas.toBlob(blob => {
        const formData = new FormData();
        formData.append("frame", blob, "frame.jpg");

        fetch(API + "/analyze-frame", {
            method: "POST",
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;

            // Update UI text
            document.getElementById("liveEmotion").innerText = data.dominant;
            document.getElementById("liveScore").innerText = data.deception_score;
            
            const verdictEl = document.getElementById("liveVerdict");
            verdictEl.innerText = data.verdict;
            
            // Color code verdict
            if (data.verdict === 'deceptive') verdictEl.style.color = '#ef4444';
            else if (data.verdict === 'uncertain') verdictEl.style.color = '#eab308';
            else verdictEl.style.color = '#10b981';

            drawFaceBox(data.face_box, data.verdict);
            updateBarChart(data.emotions);
        })
        .catch(err => console.error("API Error:", err));
    }, "image/jpeg", 0.8);
}

function drawFaceBox(box, verdict) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!box) return;

    // Change box color based on verdict
    let color = "#10b981"; // Truthful (Green)
    if (verdict === 'deceptive') color = "#ef4444"; // Red
    if (verdict === 'uncertain') color = "#eab308"; // Yellow

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    
    // Draw slightly transparent background for label
    ctx.fillStyle = color;
    ctx.fillRect(box.x, box.y - 30, box.w, 30);
    
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText(verdict.toUpperCase(), box.x + 5, box.y - 10);
}

// --- VIDEO UPLOAD ANALYSIS ---

function uploadVideo() {
    const fileInput = document.getElementById("videoFile");
    if (!fileInput.files.length) return alert("Please select a video file first.");

    const formData = new FormData();
    formData.append("video", fileInput.files[0]);

    const btn = document.getElementById("uploadBtn");
    const status = document.getElementById("uploadStatus");
    btn.disabled = true;
    btn.innerText = "Analyzing...";
    status.classList.remove("hidden");

    fetch(API + "/analyze", {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        btn.disabled = false;
        btn.innerText = "Analyze Video File";
        status.classList.add("hidden");

        if (data.error) return alert("Error: " + data.error);

        displayVideoResults(data);
        updateTimelineChart(data.timeline);
    })
    .catch(err => {
        btn.disabled = false;
        btn.innerText = "Analyze Video File";
        status.classList.add("hidden");
        alert("Upload failed. Ensure backend is running.");
    });
}

function displayVideoResults(data) {
    const panel = document.getElementById("videoResultsPanel");
    panel.classList.remove("hidden");

    const scoreEl = document.getElementById("riskScoreVal");
    const levelEl = document.getElementById("riskLevelVal");
    
    scoreEl.innerText = data.risk.score;
    scoreEl.style.color = data.risk.color;
    levelEl.innerText = data.risk.level;
    levelEl.style.color = data.risk.color;

    const list = document.getElementById("indicatorsList");
    list.innerHTML = "";
    
    if (data.risk.indicators.length === 0) {
        list.innerHTML = "<li class='text-slate-500 italic'>No significant deception indicators detected.</li>";
    }

    data.risk.indicators.forEach(ind => {
        const li = document.createElement("li");
        li.className = "p-2 rounded bg-slate-700 border-l-4";
        
        // Set border color based on severity
        if (ind.severity === 'high') li.style.borderColor = '#ef4444';
        else if (ind.severity === 'medium') li.style.borderColor = '#eab308';
        else li.style.borderColor = '#3b82f6';

        li.innerHTML = `<strong class="text-white block">${ind.name}</strong><span class="text-slate-400">${ind.description}</span>`;
        list.appendChild(li);
    });
}

// --- CHARTS ---

function updateBarChart(emotions) {
    const labels = Object.keys(emotions);
    const values = Object.values(emotions);
    const bgColors = labels.map(label => emotionColors[label] || '#fff');

    if (chartInstance && chartInstance.config.type === 'bar') {
        chartInstance.data.datasets[0].data = values;
        chartInstance.update();
    } else {
        if (chartInstance) chartInstance.destroy();
        const ctxChart = document.getElementById("emotionChart").getContext("2d");
        chartInstance = new Chart(ctxChart, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Emotion %',
                    data: values,
                    backgroundColor: bgColors,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 }, // Smooth short animation for live feed
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: '#334155' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function updateTimelineChart(timeline) {
    const labels = timeline.map(t => t.timestamp + "s");
    const dataNeutral = timeline.map(t => t.emotions.neutral);
    const dataNegative = timeline.map(t => t.emotions.fear + t.emotions.angry + t.emotions.disgust);

    if (chartInstance) chartInstance.destroy();
    
    const ctxChart = document.getElementById("emotionChart").getContext("2d");
    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Neutral %',
                    data: dataNeutral,
                    borderColor: emotionColors.neutral,
                    tension: 0.3,
                    borderWidth: 2
                },
                {
                    label: 'Combined Negative (Fear+Anger+Disgust)',
                    data: dataNegative,
                    borderColor: emotionColors.angry,
                    tension: 0.3,
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#cbd5e1' } }
            },
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: '#334155' } },
                x: { grid: { color: '#334155' }, ticks: { maxTicksLimit: 10 } }
            }
        }
    });
}