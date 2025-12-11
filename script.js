// GitHub button functionality
const githubButton = document.getElementById('github-btn');

if (githubButton) {
    githubButton.addEventListener('click', function() {
        window.open('https://github.com/Tigranoff/RomanNumberQuizGame.git', '_blank');
    });
}

document.addEventListener('DOMContentLoaded', () => {
	// Open repo in new tab when a button with data-repo is clicked
	document.querySelectorAll('[data-repo]').forEach(btn => {
		btn.addEventListener('click', () => {
			const url = btn.getAttribute('data-repo');
			if (url) window.open(url, '_blank', 'noopener');
		});
	});
});