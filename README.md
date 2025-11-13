# Tempo Pomodoro

A minimalist Node + vanilla JS Pomodoro starter that keeps track of focus sessions, earned break credit, and simple stats in the browser.

## Features
- Focus timer with configurable hh:mm duration.
- Customizable amount of break time earned per pomodoro (hh:mm:ss).
- Break credit rate so every second of work can add fractional break time.
- Break clock that spends (and can overdraw) your break credit balance.
- LocalStorage persistence for settings, stats, and break credit.
- Simple stats dashboard for completed pomodoros, total focus time, and average focus/break lengths.
- Optional audio + desktop notifications when a focus block completes (click **Enable Notifications** in the header).
- Selectable alert sounds (or mute entirely) plus a recent focus-completion log so you can verify alerts fired.
- Choose whether focus sessions auto-complete at the target time or keep counting (with notifications) until you manually pause.

## Getting Started
```bash
npm install
npm start
```
Visit `http://localhost:3000` to use the timer. Settings and stats are stored in your browser, so they will survive refreshes.
