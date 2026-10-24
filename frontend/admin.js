
const API_URL = "http://127.0.0.1:3000/api";

// ==========================================
// STATE
// ==========================================

let customers = [];
let counters = [];
let isLoading = false;
let analyticsLoading = false;
let authenticationReady = false;
let redirectingToLogin = false;

// ==========================================
// HTML ELEMENTS
// ==========================================

const tableBody = document.getElementById("queueTableBody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

const totalCount = document.getElementById("totalCount");
const waitingCount = document.getElementById("waitingCount");
const servingCount = document.getElementById("servingCount");
const completedCount = document.getElementById("completedCount");
const resultCount = document.getElementById("resultCount");

const callNextBtn = document.getElementById("callNextBtn");
const resetBtn = document.getElementById("resetBtn");
const logoutButton = document.getElementById("logoutBtn");

const analyticsDate = document.getElementById("analyticsDate");
const analyticsStatus = document.getElementById("analyticsStatus");

// ==========================================
// SAFE HTML OUTPUT
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

function formatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toLocaleString()
        : "0";
}

function formatMinutes(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return "—";
    }

    if (number < 1) {
        return `${Math.round(number * 60)} sec`;
    }

    if (number < 60) {
        return `${number.toFixed(1)} min`;
    }

    const hours = Math.floor(number / 60);
    const minutes = Math.round(number % 60);

    return `${hours}h ${minutes}m`;
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

function redirectToLogin() {
    if (redirectingToLogin) return;

    redirectingToLogin = true;
    authenticationReady = false;

    window.location.replace("login.html");
}

async function checkAdminSession() {
    try {
        const response = await fetch(`${API_URL}/admin/session`, {
            method: "GET",
            credentials: "include",
            cache: "no-store"
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin();
            return false;
        }

        if (!response.ok) {
            throw new Error(
                `Session verification failed (HTTP ${response.status}).`
            );
        }

        const data = await response.json();

        if (data.success !== true || data.authenticated !== true) {
            redirectToLogin();
            return false;
        }

        authenticationReady = true;
        return true;

    } catch (error) {
        console.error("Admin session verification failed:", error);

        if (!redirectingToLogin) {
            document.body.innerHTML = `
                <main style="
                    max-width:600px;
                    margin:80px auto;
                    padding:30px;
                    font-family:Arial,sans-serif;
                    text-align:center;
                    color:#fff;
                    background:#111827;
                    border-radius:16px;
                ">
                    <h2>Unable to connect to QueueLess</h2>

                    <p style="color:#cbd5e1;line-height:1.6;">
                        Check that your backend is running at localhost:3000
                        and that your frontend origin is configured correctly.
                    </p>

                    <button id="retryConnectionBtn" style="
                        padding:12px 18px;
                        border:0;
                        border-radius:8px;
                        background:#2563eb;
                        color:white;
                        cursor:pointer;
                    ">
                        Try Again
                    </button>

                    <p style="margin-top:14px;color:#94a3b8;font-size:13px;">
                        ${escapeHTML(error.message)}
                    </p>

                    <p style="margin-top:14px;">
                        <a href="login.html" style="color:#93c5fd;">
                            Return to login
                        </a>
                    </p>
                </main>
            `;

            document.getElementById("retryConnectionBtn")
                ?.addEventListener("click", () => window.location.reload());
        }

        return false;
    }
}

// ==========================================
// AUTHENTICATED API HELPER
// ==========================================

async function adminFetch(url, options = {}) {
    if (!authenticationReady || redirectingToLogin) {
        throw new Error("Your admin session is not ready.");
    }

    const response = await fetch(url, {
        ...options,
        credentials: "include",
        cache: options.cache || "no-store"
    });

    if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error("Your session has expired. Please sign in again.");
    }

    return response;
}

// ==========================================
// ADMIN LOGOUT
// ==========================================

async function adminLogout() {
    if (logoutButton) {
        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";
    }

    try {
        const response = await fetch(`${API_URL}/admin/logout`, {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Logout failed. Please try again.");
        }

        authenticationReady = false;
        window.location.replace("login.html");

    } catch (error) {
        console.error("Logout error:", error);

        if (logoutButton) {
            logoutButton.disabled = false;
            logoutButton.textContent = "Logout ↗";
        }

        alert(error.message || "Could not contact the server.");
    }
}

if (logoutButton) {
    logoutButton.addEventListener("click", adminLogout);
}

// ==========================================
// INITIALIZE COUNTER PANEL
// ==========================================

function initializeCounterPanel() {
    let panel = document.getElementById("counterPanel");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "counterPanel";

        panel.style.cssText = `
            margin:24px 0;
            padding:20px;
            border-radius:16px;
            background:#111827;
            color:white;
            scroll-margin-top:24px;
        `;

        const queuePanel = document.getElementById("queueSection");

        if (queuePanel && queuePanel.parentNode) {
            queuePanel.parentNode.insertBefore(panel, queuePanel);
        } else {
            document.querySelector("main")?.appendChild(panel);
        }
    }

    panel.innerHTML = `
        <h2 style="margin-top:0;">Service Counters</h2>

        <p style="color:#cbd5e1;margin:8px 0 18px;">
            Call the next waiting customer from an available counter.
        </p>

        <div id="counterCards" style="
            display:grid;
            grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
            gap:16px;
        ">
            <p>Loading counters...</p>
        </div>
    `;
}

// ==========================================
// LOAD CUSTOMERS
// ==========================================

async function loadCustomers(showError = true) {
    if (!authenticationReady || redirectingToLogin) return;

    try {
        isLoading = true;

        const response = await adminFetch(`${API_URL}/queue`);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                data?.error || "Could not load customers from the server."
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("The server returned an invalid queue.");
        }

        customers = data;
        renderQueue();

    } catch (error) {
        if (redirectingToLogin) return;

        console.error("Queue loading error:", error);

        if (showError && emptyState) {
            emptyState.hidden = false;
            emptyState.innerHTML = `
                <div>⚠</div>
                <h3>Unable to load queue</h3>
                <p>Check that your backend is running and try again.</p>
            `;

            if (resultCount) {
                resultCount.textContent = "Unable to load queue";
            }
        }
    } finally {
        isLoading = false;
    }
}

// ==========================================
// LOAD COUNTERS
// ==========================================

async function loadCounters(showError = true) {
    if (!authenticationReady || redirectingToLogin) return;

    try {
        const response = await adminFetch(`${API_URL}/counters`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || "Could not load service counters."
            );
        }

        if (!data.success || !Array.isArray(data.counters)) {
            throw new Error("Invalid counter data returned by the server.");
        }

        counters = data.counters;
        renderCounters();

    } catch (error) {
        if (redirectingToLogin) return;

        console.error("Counter loading error:", error);

        const container = document.getElementById("counterCards");

        if (container && showError) {
            container.innerHTML = `
                <p style="color:#fca5a5;">
                    Unable to load counters. Check your backend.
                </p>
            `;
        }
    }
}

// ==========================================
// LOAD ANALYTICS
// ==========================================

async function loadAnalytics() {
    if (
        !authenticationReady ||
        redirectingToLogin ||
        analyticsLoading
    ) {
        return;
    }

    analyticsLoading = true;

    const selectedDate =
        analyticsDate?.value || getLocalDateString();

    if (analyticsStatus) {
        analyticsStatus.className = "analytics-status";
        analyticsStatus.textContent = "Loading analytics...";
    }

    try {
        const response = await adminFetch(
            `${API_URL}/analytics?date=${encodeURIComponent(selectedDate)}`
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Unable to load analytics.");
        }

        renderAnalytics(data);

        if (analyticsStatus) {
            analyticsStatus.className = "analytics-status success";
            analyticsStatus.textContent =
                `Analytics loaded for ${data.date || selectedDate}.`;
        }

    } catch (error) {
        if (redirectingToLogin) return;

        console.error("Analytics loading error:", error);

        if (analyticsStatus) {
            analyticsStatus.className = "analytics-status error";
            analyticsStatus.textContent =
                `${error.message} Check that the analytics API is working.`;
        }

        setText("analyticsTotal", "—");
        setText("analyticsCompleted", "—");
        setText("analyticsWait", "—");
        setText("analyticsSkipped", "—");

        setHTML(
            "hourlyChart",
            '<p class="chart-placeholder">Analytics could not be loaded.</p>'
        );

        setHTML("chartYAxis", "");

        setHTML(
            "counterPerformance",
            '<p class="chart-placeholder">Counter performance unavailable.</p>'
        );

        setText("busiestHour", "Busiest hour: unavailable.");

    } finally {
        analyticsLoading = false;
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setHTML(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = value;
}

// ==========================================
// RENDER ANALYTICS
// ==========================================

function renderAnalytics(data) {
    const summary = data.summary || {};

    setText(
        "analyticsTotal",
        formatNumber(summary.total ?? summary.totalCustomers ?? 0)
    );

    setText(
        "analyticsCompleted",
        formatNumber(summary.completed ?? 0)
    );

    setText(
        "analyticsWait",
        formatMinutes(summary.averageWaitingMinutes)
    );

    setText(
        "analyticsSkipped",
        formatNumber(summary.skipped ?? 0)
    );

    renderHourlyChart(data.hourlyCustomers || []);
    renderCounterPerformance(data.counterPerformance || []);

    const busiest = summary.busiestHour;

    if (
        busiest &&
        Number(busiest.customers) > 0 &&
        Number.isFinite(Number(busiest.hour))
    ) {
        setText(
            "busiestHour",
            `Busiest hour: ${formatHour(busiest.hour)} — ` +
            `${formatNumber(busiest.customers)} customer(s)`
        );
    } else {
        setText(
            "busiestHour",
            "Busiest hour: no customer activity recorded for this date."
        );
    }
}

function formatHour(hour) {
    const value = Number(hour);

    if (!Number.isInteger(value) || value < 0 || value > 23) {
        return "Unknown";
    }

    const start = new Date();
    start.setHours(value, 0, 0, 0);

    const end = new Date(start);
    end.setHours(value + 1);

    return `${start.toLocaleTimeString([], {
        hour: "numeric"
    })}–${end.toLocaleTimeString([], {
        hour: "numeric"
    })}`;
}

// ==========================================
// HOURLY CUSTOMER CHART
// ==========================================

function renderHourlyChart(hourlyData) {
    const chart = document.getElementById("hourlyChart");
    const yAxis = document.getElementById("chartYAxis");

    if (!chart || !yAxis) return;

    const hourlyCounts = Array.from({ length: 24 }, () => 0);

    if (Array.isArray(hourlyData)) {
        hourlyData.forEach(item => {
            const hour = Number(item.hour);
            const count = Number(item.customers);

            if (
                Number.isInteger(hour) &&
                hour >= 0 &&
                hour < 24 &&
                Number.isFinite(count) &&
                count >= 0
            ) {
                hourlyCounts[hour] = count;
            }
        });
    }

    const maxCount = Math.max(...hourlyCounts, 0);
    const chartMaximum =
        maxCount === 0 ? 4 : Math.ceil(maxCount / 4) * 4;

    yAxis.innerHTML = [4, 3, 2, 1, 0]
        .map(step =>
            `<span>${Math.round(chartMaximum * step / 4)}</span>`
        )
        .join("");

    chart.innerHTML = hourlyCounts.map((count, hour) => {
        const height =
            maxCount === 0 ? 0 : (count / chartMaximum) * 100;

        return `
            <div
                class="chart-column"
                tabindex="0"
                title="${escapeHTML(formatHour(hour))}: ${count} customer(s)"
                aria-label="${escapeHTML(formatHour(hour))}: ${count} customers"
            >
                <div class="chart-bar" style="height:${height}%;"></div>

                <span class="chart-label">
                    ${hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                </span>
            </div>
        `;
    }).join("");
}

// ==========================================
// COUNTER PERFORMANCE
// ==========================================

function renderCounterPerformance(performanceData) {
    const container = document.getElementById("counterPerformance");

    if (!container) return;

    if (!Array.isArray(performanceData) || performanceData.length === 0) {
        container.innerHTML =
            '<p class="chart-placeholder">No counter activity recorded.</p>';
        return;
    }

    const maximum = Math.max(
        1,
        ...performanceData.map(counter =>
            Number(counter.totalCalled) || 0
        )
    );

    container.innerHTML = performanceData.map(counter => {
        const total = Number(counter.totalCalled) || 0;
        const completed = Number(counter.completedCustomers) || 0;
        const serving = Number(counter.currentlyServing) || 0;
        const number = Number(counter.counterNumber);
        const width = Math.min(100, (total / maximum) * 100);
        const counterName = counter.name || `Counter ${number}`;

        return `
            <div class="performance-item">
                <div class="performance-top">
                    <strong>${escapeHTML(counterName)}</strong>
                    <span>${formatNumber(total)} called</span>
                </div>

                <div
                    class="performance-track"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="${maximum}"
                    aria-valuenow="${total}"
                    aria-label="${escapeHTML(counterName)} customers called"
                >
                    <div
                        class="performance-fill"
                        style="width:${width}%;"
                    ></div>
                </div>

                <div class="performance-meta">
                    <span>Completed: ${formatNumber(completed)}</span>
                    <span>Serving: ${formatNumber(serving)}</span>
                </div>
            </div>
        `;
    }).join("");
}

// ==========================================
// DASHBOARD STATISTICS
// ==========================================

function updateStats() {
    if (totalCount) totalCount.textContent = customers.length;

    if (waitingCount) {
        waitingCount.textContent = customers.filter(
            customer => customer.status === "Waiting"
        ).length;
    }

    if (servingCount) {
        servingCount.textContent = customers.filter(
            customer => customer.status === "Serving"
        ).length;
    }

    if (completedCount) {
        completedCount.textContent = customers.filter(
            customer => customer.status === "Completed"
        ).length;
    }
}

// ==========================================
// STATUS STYLING
// ==========================================

function getStatusClass(status) {
    return {
        Waiting: "status-waiting",
        Serving: "status-serving",
        Completed: "status-completed",
        Skipped: "status-skipped"
    }[status] || "status-waiting";
}

// ==========================================
// RENDER QUEUE TABLE
// ==========================================

function renderQueue() {
    if (!tableBody || !searchInput || !statusFilter) {
        console.error("Queue dashboard HTML elements are missing.");
        return;
    }

    const query = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;

    const filtered = customers.filter(customer => {
        const token = String(customer.token || "").toLowerCase();
        const name = String(customer.name || "").toLowerCase();
        const service = String(customer.service || "").toLowerCase();

        const matchesSearch =
            token.includes(query) ||
            name.includes(query) ||
            service.includes(query);

        const matchesStatus =
            selectedStatus === "all" ||
            customer.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });

    tableBody.innerHTML = filtered.map(customer => {
        const id = escapeHTML(customer._id);

        const counterLabel = customer.counterNumber
            ? `Counter ${customer.counterNumber}`
            : "—";

        return `
            <tr>
                <td class="token">${escapeHTML(customer.token)}</td>
                <td class="customer-name">${escapeHTML(customer.name)}</td>
                <td class="service-name">${escapeHTML(customer.service)}</td>

                <td>
                    <span class="status ${getStatusClass(customer.status)}">
                        ${escapeHTML(customer.status)}
                    </span>
                </td>

                <td>${escapeHTML(counterLabel)}</td>

                <td>
                    <div class="row-actions">
                        ${
                            customer.status === "Waiting"
                                ? `
                                    <select
                                        aria-label="Choose counter for ${escapeHTML(customer.token)}"
                                        id="counter-select-${id}"
                                        class="counter-select"
                                    >
                                        ${counters.map(counter => `
                                            <option value="${Number(counter.counterNumber)}">
                                                Counter ${Number(counter.counterNumber)}
                                            </option>
                                        `).join("")}
                                    </select>

                                    <button class="small-btn"
                                        data-action="call"
                                        data-id="${id}">
                                        Call
                                    </button>

                                    <button class="small-btn"
                                        data-action="skip"
                                        data-id="${id}">
                                        Skip
                                    </button>
                                `
                                : ""
                        }

                        ${
                            customer.status === "Serving"
                                ? `
                                    <button class="small-btn"
                                        data-action="complete"
                                        data-id="${id}">
                                        Complete
                                    </button>

                                    <button class="small-btn"
                                        data-action="skip-serving"
                                        data-id="${id}">
                                        Skip
                                    </button>
                                `
                                : ""
                        }

                        <button class="small-btn delete-btn"
                            data-action="delete"
                            data-id="${id}">
                            Remove
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    if (emptyState) {
        emptyState.hidden = filtered.length !== 0;

        if (filtered.length === 0) {
            emptyState.innerHTML = `
                <div>☷</div>
                <h3>${isLoading ? "Loading customers..." : "No customers found"}</h3>
                <p>Try another search or add a customer from the main website.</p>
            `;
        }
    }

    if (resultCount) {
        resultCount.textContent =
            `${filtered.length} customer${filtered.length === 1 ? "" : "s"}`;
    }

    updateStats();
}

// ==========================================
// RENDER COUNTER CARDS
// ==========================================

function renderCounters() {
    const container = document.getElementById("counterCards");

    if (!container) return;

    if (counters.length === 0) {
        container.innerHTML = "<p>No counters found.</p>";
        return;
    }

    container.innerHTML = counters.map(counter => {
        const customer = counter.customer;
        const isServing = Boolean(customer);
        const counterNumber = Number(counter.counterNumber);

        return `
            <article style="
                background:#1f2937;
                border:1px solid ${isServing ? "#22c55e" : "#475569"};
                border-radius:12px;
                padding:18px;
            ">
                <h3 style="margin-top:0;">
                    ${escapeHTML(counter.name || `Counter ${counterNumber}`)}
                </h3>

                <p style="font-size:12px;color:#cbd5e1;margin-top:8px;">
                    ${isServing ? "CURRENTLY SERVING" : "AVAILABLE"}
                </p>

                <div style="
                    font-size:26px;
                    font-weight:800;
                    margin:12px 0;
                ">
                    ${isServing ? escapeHTML(customer.token) : "—"}
                </div>

                <p style="color:#cbd5e1;margin-bottom:15px;">
                    ${
                        isServing
                            ? escapeHTML(customer.name)
                            : "Ready for next customer"
                    }
                </p>

                ${
                    isServing
                        ? `
                            <button class="counter-action-btn"
                                data-counter-action="complete"
                                data-id="${escapeHTML(customer._id)}"
                                style="
                                    padding:10px 14px;
                                    border:0;
                                    border-radius:8px;
                                    background:#16a34a;
                                    color:white;
                                    cursor:pointer;
                                ">
                                Complete Service
                            </button>
                        `
                        : `
                            <button class="counter-action-btn"
                                data-counter-action="next"
                                data-counter="${counterNumber}"
                                style="
                                    padding:10px 14px;
                                    border:0;
                                    border-radius:8px;
                                    background:#2563eb;
                                    color:white;
                                    cursor:pointer;
                                ">
                                Call Next Customer
                            </button>
                        `
                }
            </article>
        `;
    }).join("");
}

// ==========================================
// API: UPDATE CUSTOMER STATUS
// ==========================================

async function updateCustomerStatus(customer, status, counterNumber) {
    const body = { status };

    if (counterNumber !== undefined) {
        body.counterNumber = counterNumber;
    }

    const response = await adminFetch(
        `${API_URL}/queue/${encodeURIComponent(customer._id)}/status`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not update customer status."
        );
    }

    await refreshDashboard();
}

// ==========================================
// API: CALL NEXT CUSTOMER AT A COUNTER
// ==========================================

async function callNextAtCounter(counterNumber) {
    if (!Number.isInteger(counterNumber) || counterNumber < 1) {
        throw new Error("Please select a valid service counter.");
    }

    const response = await adminFetch(
        `${API_URL}/counters/${counterNumber}/next`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not call the next customer."
        );
    }

    await refreshDashboard();

    alert(data.message || "Next customer called.");
}

// ==========================================
// API: DELETE CUSTOMER
// ==========================================

async function deleteCustomer(customer) {
    const confirmed = confirm(
        `Remove token ${customer.token} from the queue?`
    );

    if (!confirmed) return;

    const response = await adminFetch(
        `${API_URL}/queue/${encodeURIComponent(customer._id)}`,
        {
            method: "DELETE"
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not remove customer."
        );
    }

    await refreshDashboard();
}

// ==========================================
// REFRESH QUEUE AND COUNTERS
// ==========================================

async function refreshDashboard() {
    if (!authenticationReady || redirectingToLogin) return;

    await Promise.all([
        loadCustomers(false),
        loadCounters(false)
    ]);
}

// ==========================================
// QUEUE TABLE ACTIONS
// ==========================================

async function performAction(action, id) {
    if (!authenticationReady || redirectingToLogin) return;

    const customer = customers.find(
        item => String(item._id) === String(id)
    );

    if (!customer) {
        alert("Customer not found. Refreshing the queue...");
        await refreshDashboard();
        return;
    }

    try {
        if (action === "call") {
            const select = document.getElementById(`counter-select-${id}`);
            const counterNumber = Number(select?.value);

            if (!counterNumber) {
                alert("Please choose a service counter.");
                return;
            }

            await updateCustomerStatus(customer, "Serving", counterNumber);

            alert(
                `Now serving ${customer.name} — ${customer.token} at Counter ${counterNumber}`
            );
        } else if (action === "complete") {
            await updateCustomerStatus(customer, "Completed");
        } else if (action === "skip" || action === "skip-serving") {
            await updateCustomerStatus(customer, "Skipped");
        } else if (action === "delete") {
            await deleteCustomer(customer);
        }

        await loadAnalytics();

    } catch (error) {
        if (redirectingToLogin) return;

        console.error("Admin action error:", error);
        alert(error.message || "Something went wrong.");

        await refreshDashboard();
    }
}

// ==========================================
// TABLE BUTTON EVENTS
// ==========================================

if (tableBody) {
    tableBody.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        performAction(button.dataset.action, button.dataset.id);
    });
}

// ==========================================
// COUNTER PANEL BUTTON EVENTS
// ==========================================

document.addEventListener("click", async event => {
    const button = event.target.closest("[data-counter-action]");

    if (!button || !authenticationReady) return;

    try {
        const action = button.dataset.counterAction;

        if (action === "next") {
            await callNextAtCounter(Number(button.dataset.counter));
        } else if (action === "complete") {
            const customer = customers.find(
                item => String(item._id) === String(button.dataset.id)
            );

            if (!customer) {
                await refreshDashboard();
                return;
            }

            await updateCustomerStatus(customer, "Completed");

            alert(`${customer.token} completed successfully.`);
        }

        await loadAnalytics();

    } catch (error) {
        if (redirectingToLogin) return;

        console.error("Counter action error:", error);
        alert(error.message || "Counter action failed.");

        await refreshDashboard();
    }
});

// ==========================================
// GENERAL CALL NEXT BUTTON
// ==========================================

if (callNextBtn) {
    callNextBtn.addEventListener("click", async () => {
        if (!authenticationReady || redirectingToLogin) return;

        const availableCounter = counters.find(
            counter => !counter.customer
        );

        if (!availableCounter) {
            alert("All counters are busy. Complete a service first.");
            return;
        }

        try {
            await callNextAtCounter(
                Number(availableCounter.counterNumber)
            );

            await loadAnalytics();

        } catch (error) {
            if (redirectingToLogin) return;

            console.error("Call next error:", error);
            alert(error.message || "Could not call the next customer.");
        }
    });
}

// ==========================================
// SEARCH, FILTER, DATE AND RESET
// ==========================================

if (searchInput) {
    searchInput.addEventListener("input", renderQueue);
}

if (statusFilter) {
    statusFilter.addEventListener("change", renderQueue);
}

if (analyticsDate) {
    analyticsDate.value = getLocalDateString();
    analyticsDate.addEventListener("change", loadAnalytics);
}

if (resetBtn) {
    resetBtn.addEventListener("click", () => {
        alert(
            "Demo reset is disabled. Remove individual customers using the Remove button."
        );
    });
}

// ==========================================
// AUTHENTICATED DASHBOARD INITIALIZATION
// ==========================================

async function initializeDashboard() {
    const authenticated = await checkAdminSession();

    if (!authenticated || redirectingToLogin) {
        return;
    }

    initializeCounterPanel();

    await refreshDashboard();

    if (!redirectingToLogin) {
        await loadAnalytics();
    }
}

initializeDashboard();

// ==========================================
// AUTOMATIC REFRESH EVERY 15 SECONDS
// ==========================================

setInterval(() => {
    if (
        !document.hidden &&
        authenticationReady &&
        !redirectingToLogin
    ) {
        refreshDashboard();
        loadAnalytics();
    }
}, 15000);

