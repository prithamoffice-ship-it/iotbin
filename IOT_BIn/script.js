// MQTT Configuration
const mqttBroker = 'test.mosquitto.org';
const mqttPort = 8080;
const mqttTopic = 'scale/weight';

// Initialize variables
let currentWeight = 0;
let cumulativeWeight = 0;
let itemsAdded = 0;
let updateCount = 0;
let alertCount = 0;
let lastWeight = 0;
let lastItemWeight = 0; // Track the weight of the last item added

// Store daily data by date (YYYY-MM-DD format)
let dailyData = {};

// Store all received MQTT messages for debugging
let allReceivedMessages = [];

// Initialize MQTT Client
const client = new Paho.MQTT.Client(mqttBroker, mqttPort, 'clientId-' + parseInt(Math.random() * 1000));

// Set up callbacks
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// Connect to MQTT broker
client.connect({
    onSuccess: onConnect,
    onFailure: onFailure,
    useSSL: false
});

// MQTT Connection Success
function onConnect() {
    console.log('Connected to MQTT broker');
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('status-dot').classList.add('connected');
    client.subscribe(mqttTopic);
    showNotification('Connected to MQTT broker', 'info');
}

// MQTT Connection Failure
function onFailure() {
    console.error('Failed to connect to MQTT broker');
    showNotification('Failed to connect to MQTT broker', 'danger');
}

// MQTT Connection Lost
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log('Connection lost: ' + responseObject.errorMessage);
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('status-dot').classList.remove('connected');
        showNotification('Connection lost to MQTT broker', 'warning');
    }
}

// MQTT Message Received - Fixed to handle your actual message format
function onMessageArrived(message) {
    updateCount++;
    document.getElementById('update-count').textContent = updateCount;
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();

    try {
        // Parse the message to extract weight and day
        const payload = message.payloadString;
        console.log('📩 Message received from MQTT:', payload);
        
        // Store the raw message for debugging
        allReceivedMessages.push({
            timestamp: new Date().toISOString(),
            message: payload
        });

        // Extract data from your actual message format
        // Format: "Weight: 41742.41 kg | Monday"
        // Accept either g or kg
        const weightMatch = payload.match(/Weight:\s*([\d.]+)\s*(g|kg)/i);
        const dayMatch = payload.match(/\|\s*(\w+)$/i);

        if (weightMatch && weightMatch[1]) {
            // Convert to number
            let weight = parseFloat(weightMatch[1]);
            
            // Convert grams to kilograms if needed
            if (weightMatch[2] && weightMatch[2].toLowerCase() === 'g') {
                weight = weight / 1000; // Convert grams to kilograms
            }
            
            // Get day from message
            const dayFromMessage = dayMatch && dayMatch[1] ? dayMatch[1] : null;
            
            // Calculate the appropriate date based on the day in the message
            let dateObj = new Date();
            
            if (dayFromMessage) {
                // Get current day of week (0-6 where 0 is Sunday)
                const currentDayIndex = dateObj.getDay();
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const currentDayName = days[currentDayIndex];
                
                // If the message day doesn't match today, adjust the date
                if (dayFromMessage !== currentDayName) {
                    // Find how many days difference
                    const messageDayIndex = days.indexOf(dayFromMessage);
                    if (messageDayIndex !== -1) {
                        const dayDifference = messageDayIndex - currentDayIndex;
                        dateObj.setDate(dateObj.getDate() + dayDifference);
                    }
                }
            }
            
            const dateStr = formatDate(dateObj);
            const day = dayFromMessage || getDayName(dateObj);
            
            // Initialize day data if it doesn't exist
            if (!dailyData[dateStr]) {
                dailyData[dateStr] = {
                    date: dateStr,
                    day: day,
                    weights: [],
                    maxWeight: 0,
                    updateCount: 0,
                    lastWeight: 0, // Track last weight for this day
                    rawData: [] // Store raw values for debugging
                };
            }
            
            // Update day data
            dailyData[dateStr].weights.push(weight);
            dailyData[dateStr].rawData.push(weight); // Store the raw value
            dailyData[dateStr].updateCount++;
            dailyData[dateStr].lastWeight = weight; // Update last weight for this day
            
            if (weight > dailyData[dateStr].maxWeight) {
                dailyData[dateStr].maxWeight = weight;
            }
            
            // Update the UI with the new weight
            updateWeightDisplay(weight);
            
            // Update the weekly table
            updateWeeklyTable();
            
            // Log the processed data for debugging
            console.log('Processed data:', {
                date: dateStr,
                day: day,
                weight: weight,
                timestamp: dateObj.toISOString()
            });
        } else {
            console.warn('Could not extract weight from message:', payload);
            showNotification('Received message with invalid format', 'warning');
        }
    } catch (error) {
        console.error('Error processing MQTT message:', error);
        showNotification('Error processing MQTT message', 'danger');
    }
}

// Helper function to get day name from Date object
function getDayName(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

// Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get current day name
function getCurrentDayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

// Update the weekly table
function updateWeeklyTable() {
    const tableBody = document.getElementById('weekly-table-body');
    tableBody.innerHTML = '';
    
    // Get dates from the last 7 days
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(formatDate(date));
    }
    
    // Add rows for each date
    dates.forEach(date => {
        const row = document.createElement('tr');
        
        // Check if today
        const today = formatDate(new Date());
        if (date === today) {
            row.classList.add('today');
        }
        
        if (dailyData[date]) {
            const data = dailyData[date];
            const avgWeight = data.weights.length > 0 ? 
                data.weights.reduce((sum, weight) => sum + weight, 0) / data.weights.length : 0;
            
            // Use the stored lastWeight value for this day
            const lastWeight = data.lastWeight || 0;
            
            row.innerHTML = `
                <td>${formatDisplayDate(date)}</td>
                <td>${data.day}</td>
                <td>${lastWeight.toFixed(2)} kg</td>
                <td>${avgWeight.toFixed(2)} kg</td>
                <td>${data.maxWeight.toFixed(2)} kg</td>
                <td>${data.updateCount}</td>
            `;
        } else {
            const dateObj = new Date(date);
            const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
            
            row.innerHTML = `
                <td>${formatDisplayDate(date)}</td>
                <td>${dayName}</td>
                <td>0.00 kg</td>
                <td>0.00 kg</td>
                <td>0.00 kg</td>
                <td>0</td>
            `;
        }
        
        tableBody.appendChild(row);
    });
    
    // Update day navigation
    updateDayNavigation();
}

// Format date for display (MM/DD format)
function formatDisplayDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
}

// Update day navigation buttons
function updateDayNavigation() {
    const navContainer = document.getElementById('day-navigation');
    navContainer.innerHTML = '';
    
    // Get dates from the last 7 days
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(formatDate(date));
    }
    
    // Add buttons for each date
    dates.forEach((date, index) => {
        const button = document.createElement('button');
        button.className = 'day-btn';
        
        if (index === 6) {
            button.classList.add('active');
            updateDayDetail(date);
        }
        
        const dateObj = new Date(date);
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
        
        button.textContent = `${formatDisplayDate(date)} (${dayName})`;
        button.setAttribute('data-date', date);
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            updateDayDetail(date);
        });
        
        navContainer.appendChild(button);
    });
}

// Update day detail section
function updateDayDetail(date) {
    const detailElement = document.getElementById('day-detail');
    const dateObj = new Date(date);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
    
    document.getElementById('selected-day').textContent = `${formatDisplayDate(date)} - ${dayName}`;
    
    if (dailyData[date]) {
        const data = dailyData[date];
        const avgWeight = data.weights.length > 0 ? 
            data.weights.reduce((sum, weight) => sum + weight, 0) / data.weights.length : 0;
        
        // Use the stored lastWeight value for this day
        const lastWeight = data.lastWeight || 0;
        
        document.getElementById('day-max').textContent = `${data.maxWeight.toFixed(2)} kg`;
        document.getElementById('day-avg').textContent = `${avgWeight.toFixed(2)} kg`;
        document.getElementById('day-updates').textContent = data.updateCount;
        document.getElementById('day-last').textContent = `${lastWeight.toFixed(2)} kg`;
    } else {
        document.getElementById('day-max').textContent = '0.00 kg';
        document.getElementById('day-avg').textContent = '0.00 kg';
        document.getElementById('day-updates').textContent = '0';
        document.getElementById('day-last').textContent = '0.00 kg';
    }
}

// Update weight display and related UI elements
function updateWeightDisplay(weight) {
    currentWeight = weight;
    const capacity = 50; // 50 kg capacity
    const fillPercentage = Math.min(100, Math.round((weight / capacity) * 100));

    // Update the main weight display
    document.getElementById('current-weight').textContent = weight.toFixed(2) + ' kg';

    // Update the gauge
    document.getElementById('weight-gauge').style.width = fillPercentage + '%';
    document.getElementById('fill-percentage').textContent = fillPercentage + '%';
    document.getElementById('fill-percent').textContent = fillPercentage + '%';

    // Update bin visualization (if you have one)
    const binContent = document.getElementById('bin-content');
    if (binContent) {
        binContent.style.height = fillPercentage + '%';
        document.getElementById('bin-percentage').textContent = fillPercentage + '% Full';
        document.getElementById('current-fill').textContent = fillPercentage + '%';
        document.getElementById('remaining-capacity').textContent = (capacity - weight).toFixed(2) + ' kg';

        // Add or remove warning classes based on fill level
        if (fillPercentage >= 90) {
            binContent.classList.add('danger');
            document.getElementById('threshold-alert').classList.add('alert');
            if (fillPercentage >= 90 && lastWeight < 90) {
                alertCount++;
                document.getElementById('alert-count').textContent = alertCount;
                showNotification('Bin is almost full! Please empty it.', 'danger');
            }
        } else if (fillPercentage >= 75) {
            binContent.classList.remove('danger');
            binContent.classList.add('warning');
            document.getElementById('threshold-alert').classList.remove('alert');
        } else {
            binContent.classList.remove('danger', 'warning');
            document.getElementById('threshold-alert').classList.remove('alert');
        }
    }

    // Update cumulative weight and items added
    if (weight > lastWeight) {
        const weightDifference = weight - lastWeight;
        if (weightDifference > 0.1) { // Only count if significant weight added
            cumulativeWeight += weightDifference;
            itemsAdded++;
            lastItemWeight = weightDifference; // Store the last item weight
            document.getElementById('cumulative-weight').textContent = cumulativeWeight.toFixed(2) + ' kg';
            document.getElementById('items-added').textContent = itemsAdded;
            document.getElementById('last-added').textContent = lastItemWeight.toFixed(2) + ' kg';
        }
    }

    // Update daily average
    const dailyAvg = cumulativeWeight / (itemsAdded || 1);
    document.getElementById('daily-avg').textContent = dailyAvg.toFixed(2) + ' kg';

    lastWeight = weight;
    
    // Update the chart
    updateChart(weight);
}

// Show notification
function showNotification(message, type) {
    const notificationPanel = document.getElementById('notification-panel');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'info' ? 'info-circle' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    notificationPanel.appendChild(notification);

    // Show notification
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

// Initialize the weight chart
const ctx = document.getElementById('weight-chart').getContext('2d');
const weightChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Weight (kg)',
            data: [],
            borderColor: '#fdbb2d',
            backgroundColor: 'rgba(253, 187, 45, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)'
                }
            },
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)'
                }
            }
        },
        plugins: {
            legend: {
                labels: {
                    color: 'rgba(255, 255, 255, 0.7)'
                }
            }
        }
    }
});

// Update chart with new data
function updateChart(weight) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    // Add new data point
    weightChart.data.labels.push(timeLabel);
    weightChart.data.datasets[0].data.push(weight);

    // Keep only the last 20 data points
    if (weightChart.data.labels.length > 20) {
        weightChart.data.labels.shift();
        weightChart.data.datasets[0].data.shift();
    }

    // Update the chart
    weightChart.update();
}

// Reset statistics
document.getElementById('reset-btn').addEventListener('click', function() {
    cumulativeWeight = 0;
    itemsAdded = 0;
    alertCount = 0;
    lastItemWeight = 0;
    document.getElementById('cumulative-weight').textContent = '0.0 kg';
    document.getElementById('items-added').textContent = '0';
    document.getElementById('alert-count').textContent = '0';
    document.getElementById('daily-avg').textContent = '0.0 kg';
    document.getElementById('last-added').textContent = '0.0 kg';
    showNotification('Statistics have been reset', 'info');
});

// View stored data
document.getElementById('view-data-btn').addEventListener('click', function() {
    console.log('All received messages:', allReceivedMessages);
    console.log('Daily data:', dailyData);
    showNotification('Data logged to console. Press F12 to view.', 'info');
});

// Initialize the weekly table
updateWeeklyTable();