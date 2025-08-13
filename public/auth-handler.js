// Global authentication handler for all pages

(function() {
    'use strict';
    
    // Check if we're on the login page
    if (window.location.pathname.includes('login.html')) {
        return; // Don't run auth checks on login page
    }
    
    let sessionCheckInterval;
    
    // Check authentication status
    async function checkAuthStatus() {
        try {
            const response = await fetch('/auth/session');
            const data = await response.json();
            
            if (!data.loggedIn) {
                // Redirect to login if not authenticated
                window.location.href = '/login.html';
                return false;
            }
            
            // Update session info in UI if elements exist
            updateSessionInfo(data);
            return true;
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
            return false;
        }
    }
    
    // Update session information in the UI
    function updateSessionInfo(sessionData) {
        // Add logout button if not exists
        if (!document.getElementById('logoutBtn')) {
            addLogoutButton();
        }
        
        // Update session timer if element exists
        const sessionTimer = document.getElementById('sessionTimer');
        if (sessionTimer && sessionData.timeRemaining) {
            const minutes = Math.floor(sessionData.timeRemaining / (1000 * 60));
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            
            if (hours > 0) {
                sessionTimer.textContent = `${hours}:${remainingMinutes.toString().padStart(2, '0')}`;
            } else {
                sessionTimer.textContent = `${remainingMinutes} דק'`;
            }
            
            // Warn when less than 10 minutes remain
            if (minutes < 10) {
                sessionTimer.style.color = '#e53e3e';
                if (minutes < 5 && !sessionTimer.classList.contains('warning-shown')) {
                    sessionTimer.classList.add('warning-shown');
                    showSessionWarning();
                }
            }
        }
    }
    
    // Add logout button to pages
    function addLogoutButton() {
        // Look for navigation or header areas
        const navButtons = document.querySelector('.nav-buttons');
        const header = document.querySelector('.header');
        
        if (navButtons || header) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.innerHTML = '🚪 יציאה';
            logoutBtn.className = 'nav-btn logout-btn';
            logoutBtn.style.cssText = `
                background: #e53e3e;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s ease;
                margin-left: 10px;
            `;
            
            logoutBtn.addEventListener('click', logout);
            logoutBtn.addEventListener('mouseover', () => {
                logoutBtn.style.background = '#c53030';
                logoutBtn.style.transform = 'translateY(-2px)';
            });
            logoutBtn.addEventListener('mouseout', () => {
                logoutBtn.style.background = '#e53e3e';
                logoutBtn.style.transform = 'translateY(0)';
            });
            
            if (navButtons) {
                navButtons.appendChild(logoutBtn);
            } else if (header) {
                header.appendChild(logoutBtn);
            }
        }
        
        // Add session timer
        addSessionTimer();
    }
    
    // Add session timer to show remaining time
    function addSessionTimer() {
        const header = document.querySelector('.header');
        if (header && !document.getElementById('sessionTimer')) {
            const timerDiv = document.createElement('div');
            timerDiv.style.cssText = `
                position: absolute;
                top: 10px;
                left: 10px;
                background: rgba(255,255,255,0.9);
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 12px;
                color: #4a5568;
                font-weight: 600;
            `;
            timerDiv.innerHTML = `
                <span style="margin-left: 5px;">⏰</span>
                <span id="sessionTimer">--:--</span>
            `;
            
            // Make header relative positioned
            header.style.position = 'relative';
            header.appendChild(timerDiv);
        }
    }
    
    // Show session expiration warning
    function showSessionWarning() {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fed7d7;
            color: #c53030;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e53e3e;
            font-weight: 600;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        warning.innerHTML = `
            ⚠️ הסשן יפוג בקרוב. שמור את עבודתך!
            <button onclick="this.parentElement.remove()" style="float: left; background: none; border: none; font-size: 16px; cursor: pointer;">×</button>
        `;
        
        document.body.appendChild(warning);
        
        setTimeout(() => warning.remove(), 10000);
    }
    
    // Logout function
    async function logout() {
        try {
            const response = await fetch('/auth/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                // Clear any local storage
                localStorage.clear();
                sessionStorage.clear();
                
                // Redirect to login
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Logout failed:', error);
            // Force redirect anyway
            window.location.href = '/login.html';
        }
    }
    
    // Make logout function global for onclick handlers
    window.logout = logout;
    
    // Enhanced fetch function that handles auth errors
    const originalFetch = window.fetch;
    window.fetch = async function(url, options) {
        const response = await originalFetch(url, options);
        
        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            if (data.redirect === '/login.html') {
                window.location.href = '/login.html';
            }
        }
        
        return response;
    };
    
    // Initialize auth checking
    async function init() {
        // Check auth status immediately
        const isAuthenticated = await checkAuthStatus();
        
        if (isAuthenticated) {
            // Start periodic session checking every 30 seconds
            sessionCheckInterval = setInterval(checkAuthStatus, 30000);
        }
    }
    
    // Handle page visibility changes to check auth when returning to tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkAuthStatus();
        }
    });
    
    // Handle beforeunload to clear interval
    window.addEventListener('beforeunload', () => {
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
        }
    });
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Add slideIn animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
})();