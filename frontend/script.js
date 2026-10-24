
const API_URL = "http://10.255.41.113:3000/api";

const form = document.getElementById("queueForm");

async function checkAPI() {
    try {
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
            throw new Error("API unavailable");
        }

        return true;
    } catch (error) {
        alert(
            "Cannot connect to QueueLess. Please make sure the backend is running."
        );

        return false;
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

async function showToken(customer) {
    const resultSection = document.getElementById("tokenResult");

    if (!resultSection) {
        alert(`Your token is ${customer.token}`);
        return;
    }

    // Update your existing design without deleting the QR-code elements.
    document.getElementById("generatedToken").textContent =
        customer.token;

    document.getElementById("customerGreeting").textContent =
        `Hello, ${customer.name}! Your service is ${customer.service}.`;

    // Show the token result section.
    resultSection.hidden = false;
    resultSection.style.display = "block";

    // Find the existing QR-code elements.
    const qrContainer = document.getElementById("qrCodeContainer");
    const qrCanvas = document.getElementById("qrCodeCanvas");

    if (!qrContainer || !qrCanvas) {
        console.error("QR-code HTML elements are missing.");
        return;
    }

    qrContainer.style.display = "block";
qrCanvas.style.display = "block";
qrCanvas.style.visibility = "visible";
qrCanvas.style.width = "220px";
qrCanvas.style.height = "220px";
    // Build the URL for the tracking page.
    const trackingUrl =
    `http://10.255.41.113:5500/track.html?id=${encodeURIComponent(customer._id)}`;

console.log("QR tracking URL:", trackingUrl);

    // Check whether the QR library loaded.
    if (
        typeof QRCode === "undefined" ||
        typeof QRCode.toCanvas !== "function"
    ) {
        console.error("QR-code library did not load.");

        qrContainer.insertAdjacentHTML(
            "beforeend",
            '<p id="qrError" style="color:red;">QR library not loaded. Check your internet connection.</p>'
        );

        return;
    }

    // Generate the QR code.
    try {
        const existingError = document.getElementById("qrError");

        if (existingError) {
            existingError.remove();
        }

        QRCode.toCanvas(
    qrCanvas,
    trackingUrl,
    {
        width: 220,
        margin: 2,
        color: {
            dark: "#17172b",
            light: "#ffffff"
        }
    },
    function (error) {
        if (error) {
            console.error("QR generation failed:", error);
            alert("QR generation failed. Check the Console.");
        } else {
            console.log("QueueLess QR code generated successfully!");
            qrCanvas.style.display = "block";
            qrCanvas.style.margin = "15px auto";
            qrCanvas.style.background = "#ffffff";
            qrCanvas.style.padding = "10px";
        }
    }
);

        console.log("QR code generated successfully:", trackingUrl);

    } catch (error) {
        console.error("QR-code generation failed:", error);

        alert("Could not generate the QR code. Check the browser console.");
    }

    // Scroll to the token result.
    resultSection.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

if (form) {
    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const nameInput = document.getElementById("customerName");
        const serviceInput = document.getElementById("serviceType");

        const name = nameInput?.value.trim();
        const service = serviceInput?.value.trim();

        if (!name || !service) {
            alert("Please enter your name and select a service.");
            return;
        }

        const submitButton = form.querySelector('[type="submit"]');

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Generating Token...";
        }

        try {
            const connected = await checkAPI();

            if (!connected) {
                return;
            }

            const response = await fetch(`${API_URL}/queue`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    service
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Backend response:", data);

                alert(
                    "Token error: " +
                    (data.error || JSON.stringify(data))
                );

                return;
            }

            if (!data.customer || !data.customer._id) {
                console.error("Unexpected backend response:", data);

                alert(
                    "Token was created, but its tracking ID is missing."
                );

                return;
            }

            await showToken(data.customer);

            form.reset();

        } catch (error) {
            console.error("Token creation error:", error);

            alert(
                error.message ||
                "Something went wrong. Please try again."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Generate My Token →";
            }
        }
    });
}

