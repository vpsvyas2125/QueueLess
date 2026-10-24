
const API_URL = "http://10.255.41.113:3000/api";
const REFRESH_INTERVAL = 5000;
const AVERAGE_SERVICE_MINUTES = 5;

let previousServingToken = null;
let soundEnabled = false;
let audioContext = null;

const servingTokenElement = document.getElementById("servingToken");
const servingNameElement = document.getElementById("servingName");
const servingMessageElement = document.getElementById("servingMessage");

const waitingCountElement = document.getElementById("waitingCount");
const completedCountElement = document.getElementById("completedCount");
const estimatedWaitElement = document.getElementById("estimatedWait");

const waitingListElement = document.getElementById("waitingList");
const queueBadgeElement = document.getElementById("queueBadge");
const connectionStatusElement = document.getElementById("connectionStatus");
const lastUpdatedElement = document.getElementById("lastUpdated");

const soundButton = document.getElementById("soundButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const displayCountersElement = document.getElementById("displayCounters");

// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ==========================================
// CLOCK
// ==========================================

function updateClock() {
    const clock = document.getElementById("clock");

    if (clock) {
        clock.textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }
}

updateClock();
setInterval(updateClock, 1000);

// ==========================================
// SOUND NOTIFICATION
// ==========================================

function playNotification() {
    if (!soundEnabled) return;

    try {
        if (!audioContext) {
            audioContext = new (
                window.AudioContext || window.webkitAudioContext
            )();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
            660,
            audioContext.currentTime + 0.18
        );

        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.18,
            audioContext.currentTime + 0.025
        );
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + 0.5
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error("Notification sound error:", error);
    }
}

if (soundButton) {
    soundButton.addEventListener("click", async () => {
        soundEnabled = !soundEnabled;

        if (soundEnabled) {
            try {
                const AudioContextClass =
                    window.AudioContext || window.webkitAudioContext;

                if (AudioContextClass && !audioContext) {
                    audioContext = new AudioContextClass();
                }

                if (audioContext?.state === "suspended") {
                    await audioContext.resume();
                }

                soundButton.textContent = "🔔 Sound: On";
                playNotification();
            } catch (error) {
                soundEnabled = false;
                soundButton.textContent = "🔕 Sound: Off";
                console.error("Could not enable sound:", error);
            }
        } else {
            soundButton.textContent = "🔕 Sound: Off";
        }
    });
}

// ==========================================
// FULLSCREEN
// ==========================================

if (fullscreenButton) {
    fullscreenButton.addEventListener("click", async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error("Fullscreen error:", error);
            alert("Fullscreen is not available in this browser.");
        }
    });

    document.addEventListener("fullscreenchange", () => {
        fullscreenButton.textContent = document.fullscreenElement
            ? "⛶ Exit Fullscreen"
            : "⛶ Fullscreen";
    });
}

// ==========================================
// WAITING TIME
// ==========================================

function estimateWait(index) {
    return index * AVERAGE_SERVICE_MINUTES;
}

function formatWait(minutes) {
    if (minutes <= 0) return "Next in line";
    if (minutes < 60) return `~${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes
        ? `~${hours}h ${remainingMinutes}m`
        : `~${hours}h`;
}

// ==========================================
// MAIN SERVING TOKEN
// ==========================================

function renderServing(servingCustomer) {
    const currentToken = servingCustomer?.token ?? null;

    if (currentToken !== previousServingToken) {
        if (previousServingToken !== null && currentToken !== null) {
            playNotification();
        }

        if (servingTokenElement) {
            servingTokenElement.classList.remove("changed");
            void servingTokenElement.offsetWidth;
            servingTokenElement.classList.add("changed");
        }

        previousServingToken = currentToken;
    }

    if (!servingTokenElement ||
        !servingNameElement ||
        !servingMessageElement) {
        return;
    }

    if (!servingCustomer) {
        servingTokenElement.textContent = "---";
        servingNameElement.textContent = "Waiting for the next customer";
        servingMessageElement.textContent = "Ready for service";
        return;
    }

    servingTokenElement.textContent = servingCustomer.token;
    servingNameElement.textContent = servingCustomer.name;

    const counterNumber = servingCustomer.counterNumber;

    servingMessageElement.textContent = counterNumber
        ? `Please proceed to Counter ${counterNumber} for ${servingCustomer.service}`
        : `Please proceed for ${servingCustomer.service}`;
}

// ==========================================
// RENDER ALL SERVICE COUNTERS
// ==========================================

function renderCounters(servingCustomers) {
    if (!displayCountersElement) return;

    const counterNumbers = [1, 2, 3];

    displayCountersElement.innerHTML = counterNumbers.map(number => {
        const customer = servingCustomers.find(
            item => Number(item.counterNumber) === number
        );

        if (!customer) {
            return `
                <article class="display-counter is-available">
                    <h3>Counter ${number}</h3>
                    <p class="counter-status">Available</p>
                    <div class="counter-token">---</div>
                    <p class="counter-customer">Ready for next customer</p>
                </article>
            `;
        }

        return `
            <article class="display-counter is-serving">
                <h3>Counter ${number}</h3>
                <p class="counter-status">Now Serving</p>
                <div class="counter-token">${escapeHTML(customer.token)}</div>
                <p class="counter-customer">${escapeHTML(customer.name)}</p>
                <p>${escapeHTML(customer.service)}</p>
            </article>
        `;
    }).join("");
}

// ==========================================
// RENDER WAITING CUSTOMERS
// ==========================================

function renderWaiting(waitingCustomers) {
    if (waitingCountElement) {
        waitingCountElement.textContent = waitingCustomers.length;
    }

    if (queueBadgeElement) {
        queueBadgeElement.textContent = `${waitingCustomers.length} waiting`;
    }

    if (estimatedWaitElement) {
        estimatedWaitElement.textContent = waitingCustomers.length
            ? formatWait(
                waitingCustomers.length * AVERAGE_SERVICE_MINUTES
            )
            : "No wait";
    }

    if (!waitingListElement) return;

    if (waitingCustomers.length === 0) {
        waitingListElement.innerHTML = `
            <div class="empty-card">
                <span class="empty-icon">✓</span>
                <h3>No customers waiting</h3>
                <p>New tokens will appear here automatically.</p>
            </div>
        `;
        return;
    }

    waitingListElement.innerHTML = waitingCustomers
        .slice(0, 8)
        .map((customer, index) => `
            <article class="queue-card">
                <div class="token">${escapeHTML(customer.token)}</div>

                <div class="customer">
                    ${escapeHTML(customer.name)}
                </div>

                <div class="service">
                    ${escapeHTML(customer.service)}
                </div>

                <div class="wait">
                    Estimated wait: ${escapeHTML(
                        formatWait(estimateWait(index + 1))
                    )}
                </div>
            </article>
        `)
        .join("");
}

// ==========================================
// FETCH QUEUE
// ==========================================

async function refreshQueue() {
    try {
        const response = await fetch(`${API_URL}/queue`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("The server could not return the queue.");
        }

        const customers = await response.json();

        if (!Array.isArray(customers)) {
            throw new Error("The server returned invalid queue data.");
        }

        const servingCustomers = customers
            .filter(customer => customer.status === "Serving")
            .sort((a, b) => {
                const dateA = new Date(a.calledAt || a.createdAt || 0).getTime();
                const dateB = new Date(b.calledAt || b.createdAt || 0).getTime();

                return dateA - dateB;
            });

        const waitingCustomers = customers
            .filter(customer => customer.status === "Waiting")
            .sort((a, b) => {
                return new Date(a.createdAt || 0) -
                       new Date(b.createdAt || 0);
            });

        const completedCustomers = customers.filter(
            customer => customer.status === "Completed"
        );

        // Preserve the original main serving area.
        // Prefer Counter 1, then the first available serving customer.
        const currentServing =
            servingCustomers.find(
                customer => Number(customer.counterNumber) === 1
            ) ||
            servingCustomers[0] ||
            null;

        renderServing(currentServing);
        renderCounters(servingCustomers);
        renderWaiting(waitingCustomers);

        if (completedCountElement) {
            completedCountElement.textContent = completedCustomers.length;
        }

        if (connectionStatusElement) {
            connectionStatusElement.textContent = "Live";
            connectionStatusElement.style.color = "#4ade80";
        }

        if (lastUpdatedElement) {
            lastUpdatedElement.textContent =
                `Updated ${new Date().toLocaleTimeString()}`;
        }

    } catch (error) {
        console.error("Live queue error:", error);

        if (connectionStatusElement) {
            connectionStatusElement.textContent = "Disconnected";
            connectionStatusElement.style.color = "#f87171";
        }

        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = "Unable to refresh queue";
        }
    }
}

// ==========================================
// INITIAL LOAD AND AUTOMATIC REFRESH
// ==========================================

refreshQueue();

setInterval(() => {
    if (!document.hidden) {
        refreshQueue();
    }
}, REFRESH_INTERVAL);

