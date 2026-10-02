const CHATBOT_API_URL =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
        ? `${window.location.protocol}//${window.location.hostname}:5000/chatbot`
        : window.location.origin + "/chatbot";

// ==========================================
// FIX FOR ISSUE #85: Global Tracking Utility
// ==========================================
let globalChatHistory = [];
const chatHistoryStorageKey = () => `climate_chatbot_history_${localStorage.getItem('disasterShieldUserId') || 'guest'}`;

function appendChatMessage(container, text, role, shouldSave = true) {
    const message = document.createElement('div');
    message.className = `chatbot-message ${role}-message`;
    message.textContent = text;
    message.style.whiteSpace = 'pre-wrap'; // Preserve newlines and lists
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;

    // Save message context to state history and push to localStorage
    if (shouldSave) {
        globalChatHistory.push({ text, role });
        try {
            localStorage.setItem(chatHistoryStorageKey(), JSON.stringify(globalChatHistory));
        } catch (e) {
            console.error("Failed to write message to localStorage:", e);
        }
    }
}

function setChatStatus(statusElement, text) {

    //Issue #67: Accessibility improvement: Ensure it acts as a live status region
    if (!statusElement.getAttribute('aria-live')) {
        statusElement.setAttribute('aria-live', 'polite');
        statusElement.setAttribute('role', 'status');
    }

    if (!text) {
        statusElement.textContent = '';
        statusElement.classList.add('hidden');
        return;
    }
    statusElement.textContent = text;
    statusElement.classList.remove('hidden');
}

function getOfflineChatbotReply(message) {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('flood') || lowerMessage.includes('flooding')) {
        return "🌊 Flood safety: move to higher ground, avoid walking or driving through floodwater, keep emergency supplies ready, and follow local evacuation updates.";
    }

    if (lowerMessage.includes('heatwave') || lowerMessage.includes('heat') || lowerMessage.includes('extreme heat')) {
        return "🔥 Heatwave safety: drink water often, avoid direct afternoon sun, wear light clothing, check on vulnerable people, and seek cooling support if you feel dizzy or weak.";
    }

    if (lowerMessage.includes('cyclone') || lowerMessage.includes('hurricane') || lowerMessage.includes('typhoon')) {
        return "🌀 Cyclone safety: secure loose outdoor items, charge devices, keep documents and medicines ready, stay away from windows, and follow official shelter guidance.";
    }

    if (lowerMessage.includes('wildfire') || lowerMessage.includes('fire')) {
        return "🌲 Wildfire safety: monitor evacuation alerts, reduce smoke exposure, keep masks and medicines ready, close windows, and leave early if officials warn your area.";
    }

    if (lowerMessage.includes('climate change') || lowerMessage.includes('climate')) {
        return "🌎 Climate change can intensify heavy rainfall, heatwaves, drought, and storms. Preparedness, early warnings, and resilient local planning reduce risk.";
    }

    return "💡 I can help with flood safety, heatwaves, cyclones, wildfire preparedness, and climate risk basics. Try asking for safety tips for one hazard.";
}

document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('chatbot-panel');
    const toggleButton = document.getElementById('chatbot-toggle');
    const closeButton = document.getElementById('chatbot-close');
    const form = document.getElementById('chatbot-form');
    const input = document.getElementById('chatbot-input');
    const messages = document.getElementById('chatbot-messages');
    const status = document.getElementById('chatbot-status');

    if (!panel || !toggleButton || !closeButton || !form || !input || !messages || !status) {
        return;
    }

    // Accessibility improvement: Let screen readers know when new messages pop up
    messages.setAttribute('aria-live', 'polite');
    messages.setAttribute('aria-relevant', 'additions');

    // ==========================================
    // FIX FOR ISSUE #85: Restore Chat History on Startup
    // ==========================================
    try {
        const savedHistory = localStorage.getItem(chatHistoryStorageKey());
        if (savedHistory) {
            globalChatHistory = JSON.parse(savedHistory);
            globalChatHistory.forEach(msg => {
                // Pass false so it prints to the screen without creating duplicates inside the array
                appendChatMessage(messages, msg.text, msg.role, false);
            });
        }
    } catch (error) {
        console.error("Failed to recover message arrays from storage tracking:", error);
    }

    // Dynamic Suggestion Chips Injection
    const suggestionContainer = document.createElement('div');
    suggestionContainer.id = 'chatbot-suggestions';
    suggestionContainer.style.display = 'flex';
    suggestionContainer.style.flexWrap = 'wrap';
    suggestionContainer.style.gap = '6px';
    suggestionContainer.style.marginBottom = '10px';
    suggestionContainer.style.padding = '4px 2px';

    const suggestions = [
        { label: "🌊 Flood Safety", text: "what precautions should i take during floods?" },
        { label: "🔥 Heatwave Safety", text: "what precautions should i take during heatwaves?" },
        { label: "🌲 Wildfire Safety", text: "what precautions should i take during wildfires?" },
        { label: "🌀 Cyclone Safety", text: "what precautions should i take during cyclones?" },
        { label: "📊 Risk Summary Here", text: "what is the current risk summary here?" }
    ];

    suggestions.forEach(item => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = item.label;
        
        //Issue #67: Accessibility improvement: Tell screen readers what clicking this chip does
        chip.setAttribute('aria-label', `Ask Disaster Shield about ${item.label.split(' ').slice(1).join(' ')}`);
        
        chip.style.background = 'rgba(255, 255, 255, 0.08)';
        chip.style.border = '1px solid rgba(255, 255, 255, 0.12)';
        chip.style.color = '#cbd5e1';
        chip.style.borderRadius = '20px';
        chip.style.padding = '5px 10px';
        chip.style.fontSize = '0.74rem';
        chip.style.cursor = 'pointer';
        chip.style.transition = 'background-color 0.2s, color 0.2s';
        chip.style.fontFamily = 'inherit';

        chip.addEventListener('mouseenter', () => {
            chip.style.background = 'rgba(56, 189, 248, 0.15)';
            chip.style.color = '#fff';
            chip.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        });
        chip.addEventListener('mouseleave', () => {
            chip.style.background = 'rgba(255, 255, 255, 0.08)';
            chip.style.color = '#cbd5e1';
            chip.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        });

        chip.addEventListener('click', () => {
            input.value = item.text;
            form.dispatchEvent(new Event('submit'));
        });

        suggestionContainer.appendChild(chip);
    });

    // Inject chips above the typing form
    panel.insertBefore(suggestionContainer, form);

    const openPanel = () => {
        panel.classList.remove('hidden');
        toggleButton.setAttribute('aria-expanded', 'true');
        input.focus();
    };

    const closePanel = () => {
        panel.classList.add('hidden');
        toggleButton.setAttribute('aria-expanded', 'false');
    };

    toggleButton.addEventListener('click', () => {
        if (panel.classList.contains('hidden')) {
            openPanel();
            return;
        }
        closePanel();
    });

    closeButton.addEventListener('click', closePanel);

    form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();

    // Duplicate message check
    const lastMsg = messages.lastChild;
    if (!message && lastMsg && lastMsg.textContent === "⚠️ Please enter a message.") {
        return;
    }

    if (!message) {
                // Show error message inside chat window

        appendChatMessage(messages, "⚠️ Please enter a message.", "bot", true);
        return;
    }

        appendChatMessage(messages, message, 'user', true);
        input.value = '';

        setChatStatus(status, 'Disaster Shield is thinking...');

        try {
            const response = await fetch(CHATBOT_API_URL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    context: window.lastAnalysisContext || null,
                    history: globalChatHistory.slice(0, -1).slice(-12),
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                appendChatMessage(
                    messages,
                    data.message || 'Unable to get a chatbot response right now.',
                    'bot',
                    true
                );
                setChatStatus(status, '');
                return;
            }

            appendChatMessage(messages, data.response, 'bot', true);
            setChatStatus(status, '');

        } catch (error) {
            console.error(error);
            appendChatMessage(
                messages,
                getOfflineChatbotReply(message),
                'bot',
                true
            );
            setChatStatus(status, '');
        }
    });
});
