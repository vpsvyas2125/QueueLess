
const API_URL = "http://10.255.41.113:3000/api";
const REFRESH_INTERVAL = 5000;
const AVERAGE_SERVICE_MINUTES = 5;

const params = new URLSearchParams(window.location.search);
const tokenId = params.get("id");

const loadingElement = document.getElementById("loading");
const errorElement = document.getElementById("error");
const detailsElement = document.getElementById("tokenDetails");
const refreshButton = document.getElementById("refreshButton");

let isRefreshing = false;
let previousStatus = null;
let previousCounterNumber = null;
let approachingNotificationSent = false;
let permissionRequested = false;

// ==========================================
// ERROR DISPLAY
// ==========================================

function showError(message) {
    loadingElement.hidden = true;
    detailsElement.hidden = true;
    errorElement.hidden = false;
    errorElement.textContent = message;
}

// ==========================================
// WAITING TIME FORMAT
// ==========================================

function formatWait(minutes) {
    if (minutes <= 0) return "No wait";

    if (minutes < 60) {
        return `~${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return remaining
        ? `~${hours}h ${remaining}m`
        : `~${hours}h`;
}

// ==========================================
// STATUS STYLING
// ==========================================

function getStatusClass(status) {
    return {
        Waiting: "",
        Serving: "serving",
        Completed: "completed",
        Skipped: "skipped"
    }[status] || "";
}

// ==========================================
// REQUEST NOTIFICATION PERMISSION
// ==========================================

async function enableNotifications() {
    if (!("Notification" in window)) {
        alert("Your browser does not support notifications.");
        return;
    }

    if (!window.isSecureContext) {
        alert(
            "Browser notifications require HTTPS or localhost. " +
            "Open this page using localhost on your computer or deploy it using HTTPS."
        );
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        permissionRequested = true;

        if (permission === "granted") {
            alert("Notifications enabled successfully!");

            new Notification("QueueLess", {
                body: "You'll be notified when your turn approaches."
            });
        } else {
            alert(
                "Notifications were not enabled. " +
                "You can allow them in your browser settings."
            );
        }
    } catch (error) {
        console.error("Notification permission error:", error);
        alert("Could not enable notifications.");
    }
}

// ==========================================
// SHOW NOTIFICATION
// ==========================================

function notifyCustomer(title, message, tag) {
    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    try {
        new Notification(title, {
            body: message,
            tag,
            icon: "./favicon.ico"
        });
    } catch (error) {
        console.error("Could not show notification:", error);
    }
}

// ==========================================
// ADD NOTIFICATION BUTTON
// ==========================================

function setupNotificationButton() {
    if (document.getElementById("enableNotificationsButton")) {
        return;
    }

    const button = document.createElement("button");
    button.id = "enableNotificationsButton";
    button.type = "button";
    button.textContent = "🔔 Enable Notifications";

    button.style.cssText = `
        margin: 12px 0;
        padding: 12px 18px;
        border: none;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        font-weight: 700;
        cursor: pointer;
    `;

    button.addEventListener("click", enableNotifications);

    detailsElement.parentNode.insertBefore(
        button,
        detailsElement
    );
}

// ==========================================
// COUNTER INFORMATION
// ==========================================

function displayCounter(customer) {
    let counterElement = document.getElementById("assignedCounter");

    if (!counterElement) {
        counterElement = document.createElement("p");
        counterElement.id = "assignedCounter";

        const statusElement = document.getElementById("tokenStatus");

        if (statusElement && statusElement.parentNode) {
            statusElement.parentNode.appendChild(counterElement);
        } else {
            detailsElement.appendChild(counterElement);
        }
    }

    if (customer.status === "Serving" && customer.counterNumber) {
        counterElement.textContent =
            `📍 Please proceed to Counter ${customer.counterNumber}`;
    } else if (customer.status === "Waiting") {
        counterElement.textContent = "📍 Counter not assigned yet";
    } else {
        counterElement.textContent = "";
    }
}

// ==========================================
// TRACK STATUS AND NOTIFY CUSTOMER
// ==========================================

function handleCustomerNotifications(customer, customersAhead) {
    // The initial load establishes the current status without
    // sending a misleading "your turn" notification.
    if (previousStatus === null) {
        previousStatus = customer.status;
        previousCounterNumber = customer.counterNumber ?? null;
        return;
    }

    // Notify once when the customer reaches approximately
    // two or fewer customers ahead in the queue.
    if (
        customer.status === "Waiting" &&
        customersAhead <= 2 &&
        !approachingNotificationSent
    ) {
        approachingNotificationSent = true;

        notifyCustomer(
            "Your turn is approaching!",
            `Token ${customer.token}: approximately ${customersAhead} customer(s) ahead of you.`,
            `approaching-${customer._id}`
        );
    }

    // Notify when the customer changes to Serving.
    if (
        customer.status === "Serving" &&
        previousStatus !== "Serving"
    ) {
        const counterText = customer.counterNumber
            ? ` Please proceed to Counter ${customer.counterNumber}.`
            : " Please check the display for your counter.";

        notifyCustomer(
            "It's your turn!",
            `Token ${customer.token} has been called.${counterText}`,
            `serving-${customer._id}`
        );
    }

    // Notify if the assigned counter changes while serving.
    if (
        customer.status === "Serving" &&
        previousStatus === "Serving" &&
        customer.counterNumber &&
        customer.counterNumber !== previousCounterNumber
    ) {
        notifyCustomer(
            "Counter updated",
            `Token ${customer.token}: please proceed to Counter ${customer.counterNumber}.`,
            `counter-${customer._id}`
        );
    }

    if (
        customer.status === "Completed" &&
        previousStatus !== "Completed"
    ) {
        notifyCustomer(
            "Service completed",
            `Your service for token ${customer.token} is complete.`,
            `completed-${customer._id}`
        );
    }

    if (
        customer.status === "Skipped" &&
        previousStatus !== "Skipped"
    ) {
        notifyCustomer(
            "Token skipped",
            `Token ${customer.token} has been marked as skipped. Please contact staff if you need assistance.`,
            `skipped-${customer._id}`
        );
    }

    previousStatus = customer.status;
    previousCounterNumber = customer.counterNumber ?? null;
}

// ==========================================
// REFRESH TRACKING STATUS
// ==========================================

async function refreshStatus() {
    if (isRefreshing) return;

    if (!tokenId) {
        showError("This tracking link is missing its token ID.");
        return;
    }

    isRefreshing = true;

    if (refreshButton) {
        refreshButton.disabled = true;
    }

    try {
        const response = await fetch(`${API_URL}/queue`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Could not retrieve the queue.");
        }

        const customers = await response.json();

        if (!Array.isArray(customers)) {
            throw new Error("The server returned invalid queue data.");
        }

        const customer = customers.find(
            item => String(item._id) === tokenId
        );

        if (!customer) {
            showError(
                "This token could not be found. It may have been removed from the queue."
            );
            return;
        }

        loadingElement.hidden = true;
        errorElement.hidden = true;
        detailsElement.hidden = false;

        document.getElementById("tokenNumber").textContent =
            customer.token || "---";

        document.getElementById("customerName").textContent =
            customer.name || "Customer";

        document.getElementById("serviceName").textContent =
            customer.service || "—";

        const statusElement = document.getElementById("tokenStatus");

        statusElement.textContent = customer.status;
        statusElement.className =
            `status-pill ${getStatusClass(customer.status)}`;

        const waitingCustomers = customers
            .filter(item => item.status === "Waiting")
            .sort((a, b) => {
                return new Date(a.createdAt || 0) -
                    new Date(b.createdAt || 0);
            });

        let customersAhead = 0;

        if (customer.status === "Waiting") {
            const position = waitingCustomers.findIndex(
                item => String(item._id) === tokenId
            );

            customersAhead = position < 0 ? 0 : position;

            document.getElementById("position").textContent =
                customersAhead;

            document.getElementById("waitTime").textContent =
                formatWait(customersAhead * AVERAGE_SERVICE_MINUTES);
        } else if (customer.status === "Serving") {
            document.getElementById("position").textContent = "Now";
            document.getElementById("waitTime").textContent = "Your turn";
        } else {
            document.getElementById("position").textContent = "—";
            document.getElementById("waitTime").textContent =
                customer.status;
        }

        displayCounter(customer);
        handleCustomerNotifications(customer, customersAhead);

        document.getElementById("lastUpdated").textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;

    } catch (error) {
        console.error("Token tracking error:", error);

        showError(
            "Unable to connect to QueueLess. Please try refreshing shortly."
        );
    } finally {
        isRefreshing = false;

        if (refreshButton) {
            refreshButton.disabled = false;
        }
    }
}

// ==========================================
// EVENTS AND INITIALIZATION
// ==========================================

if (refreshButton) {
    refreshButton.addEventListener("click", refreshStatus);
}

setupNotificationButton();
refreshStatus();

setInterval(() => {
    if (!document.hidden) {
        refreshStatus();
    }
}, REFRESH_INTERVAL);

