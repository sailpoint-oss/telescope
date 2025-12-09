# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Telescope seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@sailpoint.com**.

Include as much of the following information as possible:

- Type of issue (e.g., arbitrary code execution, path traversal, etc.)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours.
- **Communication**: We will keep you informed of the progress toward a fix and full announcement.
- **Credit**: We will credit you in the security advisory if you would like to be recognized.

### Disclosure Policy

- We follow a coordinated disclosure process.
- We ask that you give us reasonable time to address the issue before public disclosure.
- We will work with you to understand and resolve the issue quickly.

## Security Best Practices for Users

### Custom Rules

When using custom rules (`.telescope/rules/`), be aware that:

- Custom rules execute TypeScript/JavaScript code via Bun
- Only use custom rules from trusted sources
- Review custom rule code before adding to your project

### Configuration Files

- Keep `.telescope/config.yaml` in version control
- Review pattern configurations to ensure they don't expose sensitive files
- Use exclusion patterns to skip sensitive directories

## Security Updates

Security updates are released as patch versions. We recommend:

1. Keeping Telescope updated to the latest version
2. Subscribing to GitHub releases for security announcements
3. Monitoring the [CHANGELOG](CHANGELOG.md) for security-related updates

## Contact

For security concerns, contact: **security@sailpoint.com**

For general questions, use [GitHub Discussions](https://github.com/sailpoint-oss/telescope/discussions).

