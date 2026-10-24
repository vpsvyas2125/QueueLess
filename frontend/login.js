
const API_URL = "http://127.0.0.1:3000/api";

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");

async function checkExistingSession() {
    try {
        const response = await fetch(`${API_URL}/admin/session`, {
            method: "GET",
            credentials: "include",
            cache: "no-store"
        });

        if (response.ok) {
            window.location.replace("admin.html");
        }
    } catch (error) {
        console.error("Session check failed:", error);
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "";
    message.className = "";

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
        // Step 1: Submit login credentials.
        const loginResponse = await fetch(`${API_URL}/admin/login`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const loginResult = await loginResponse.json();

        if (!loginResponse.ok || !loginResult.success) {
            throw new Error(
                loginResult.error || "Login failed. Check your credentials."
            );
        }

        // Step 2: Verify that the browser can use the new session.
        message.textContent = "Verifying admin session...";
        message.className = "success";

        const sessionResponse = await fetch(`${API_URL}/admin/session`, {
            method: "GET",
            credentials: "include",
            cache: "no-store"
        });

        const sessionResult = await sessionResponse.json();

        if (
            !sessionResponse.ok ||
            sessionResult.success !== true ||
            sessionResult.authenticated !== true
        ) {
            throw new Error(
                sessionResult.error ||
                "Login succeeded, but the session cookie could not be verified. Check browser cookies."
            );
        }

        // Step 3: Open dashboard only after verification succeeds.
        message.textContent = "Login successful! Opening dashboard...";
        window.location.replace("admin.html");

    } catch (error) {
        console.error("Admin login error:", error);

        message.textContent =
            error.message || "Unable to log in. Please try again.";

        message.className = "error";

        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
    }
});

checkExistingSession();

