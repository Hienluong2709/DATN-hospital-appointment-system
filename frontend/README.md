# Frontend (Angular 17)

Structure is organized to match the current Node.js backend domains.

## Architecture

- `src/app/core`: cross-cutting technical concerns (API config, interceptors, token service)
- `src/app/shared`: reusable types/utilities for multiple features
- `src/app/features`: business modules aligned with backend routes

Current feature modules:

- `auth`
- `specialties`
- `rooms`
- `doctors`
- `work-schedules`
- `appointments`
- `queues`
- `equeue-numbers`
- `dashboard`

Each feature follows the same shape:

- `data-access`: API services calling backend endpoints
- `models`: feature-specific types/interfaces
- `pages`: standalone routed pages/components
- `<feature>.routes.ts`: local feature routing

## Run

- `npm install`
- `npm start`

Default API base URL is `http://localhost:5000/api` in `src/app/core/config/api.config.ts`.

## Build

- `npm run build`
