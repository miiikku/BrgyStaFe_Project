document.addEventListener('DOMContentLoaded', function () {
    // Event listener for notification icon
    const notifIcon = document.getElementById('notif-icon');
    if (notifIcon) {
        notifIcon.addEventListener('click', function (event) {
            event.preventDefault();
            toggleNotifPopup();
        });
    }

    // Event listener for user icon
    const userIcon = document.getElementById('user-icon');
    if (userIcon) {
        userIcon.addEventListener('click', function (event) {
            event.preventDefault();
            toggleUserPopup();
        });
    }

    // Event listener for form submission
    const requestForm = document.querySelector('form');
    if (requestForm) {
        requestForm.addEventListener('submit', function (event) {
            event.preventDefault();
        });
    }

    // Fetch user details and populate form fields
    if (typeof fetchUserDetails === 'function') {
        fetchUserDetails();
    }
});

function toggleNotifPopup() {
    const notifPopup = document.getElementById('notif-popup');
    const userPopup = document.getElementById('user-popup');
    if (userPopup && userPopup.classList.contains('show')) {
        userPopup.classList.remove('show');
    }
    if (notifPopup) {
        notifPopup.classList.toggle('show');
    }
}

function toggleUserPopup() {
    const userPopup = document.getElementById('user-popup');
    const notifPopup = document.getElementById('notif-popup');
    if (notifPopup && notifPopup.classList.contains('show')) {
        notifPopup.classList.remove('show');
    }
    if (userPopup) {
        userPopup.classList.toggle('show');
    }
}

function deleteNotif(element) {
    const notifItem = element.closest('.notif-item');
    if (notifItem) {
        notifItem.remove();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Other existing event listeners...

    // Event listener for logout
    const logoutLink = document.querySelector('a[href="/logout"]');
    if (logoutLink) {
        logoutLink.addEventListener('click', function (event) {
            event.preventDefault();
            window.location.href = '/logout';
        });
    }
});

// FOR REQUEST-DOCUMENT.HTML
document.addEventListener('DOMContentLoaded', function () {
    // Get elements by class name
    const certificateCard = document.querySelector('.certificatecard');
    const clearanceCard = document.querySelector('.clearancecard');
    const indigencyCard = document.querySelector('.indigencycard');

    // Add event listeners for navigation
    certificateCard.addEventListener('click', function () {
        window.location.href = 'request-document-cert.html';
    });

    clearanceCard.addEventListener('click', function () {
        window.location.href = 'request-document-clear.html';
    });

    indigencyCard.addEventListener('click', function () {
        window.location.href = 'request-document-indi.html';
    });
});


