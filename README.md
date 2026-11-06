# 🍷 OmniCave

> **An AI-driven wine cellar management system with Vision AI, cloud-powered multi-agent intelligence, and transparent display integration.**

OmniCave is an intelligent wine cellar management system designed to transform traditional wine storage into an actively managed and personalized digital ecosystem.

The system combines **computer vision**, **cloud-based artificial intelligence**, **environmental monitoring**, **wine inventory management**, and an **interactive transparent display** to provide a seamless connection between physical wine storage and digital management.

---

## ✨ Key Features

### 👁️ Vision AI & Automatic Inventory Management

OmniCave uses computer vision to reduce the need for manual inventory management.

- Automatic wine bottle detection
- AI-powered wine label recognition
- Extraction of wine information such as:
  - Wine name
  - Winery
  - Region
  - Vintage
  - Grape variety
- Automatic bottle registration
- Physical bottle location mapping
- Bottle movement detection
- Stacked bottle detection
- Automatic bottle removal detection
- Unique identification for individual physical bottles

Users can review and correct AI-extracted information before confirming a wine's registration.

---

### 🗺️ Visual Cellar Mapping

OmniCave connects each physical bottle to its corresponding digital location.

Users can:

- View a visual representation of their wine cellar
- Search for wines by name, winery, region, vintage, or grape variety
- Locate the exact physical position of a selected bottle
- Track bottle movements within the cellar
- Search across multiple connected wine cellars

---

### 🌡️ Environmental Monitoring

The system continuously monitors the storage environment of the wine cellar.

Features include:

- Real-time temperature monitoring
- Real-time humidity monitoring
- Historical environmental data
- Bottle-specific environmental information
- Temperature and humidity alerts
- Sensor disconnection notifications

Environmental data can be associated with specific storage locations, allowing users to better understand the conditions surrounding individual bottles.

---

### 🤖 Cloud-Powered AI Recommendations

OmniCave integrates cloud-based AI services to provide personalized wine recommendations.

The AI system can assist users with:

- 🍽️ Meal-based wine recommendations
- 🍷 Food pairing recommendations for specific wines
- 🕰️ Optimal drinking window recommendations
- 🔔 Drinking window notifications
- 📊 Personalized recommendations based on consumption history
- 📝 Customized wine lists based on budget, flavor preferences, or events
- 🗣️ Natural-language wine recommendations

Recommendations can use both the user's existing inventory and external wine data sources.

---

### 🧠 Multi-Agent Wine Critic Dialogue

One of OmniCave's key AI features is a **cloud-powered multi-agent LLM dialogue system**.

Multiple AI personas can simulate different wine critics and provide diverse perspectives on a selected wine.

The system can generate interactive discussions covering:

- Wine evaluation
- Tasting notes
- Food pairing
- Aging potential
- Drinking windows

The dialogue is streamed to the integrated display in real time, creating a more interactive and engaging wine experience.

The architecture is designed around a centralized cloud-based LLM, allowing computationally intensive AI processing to remain outside the wine cellar hardware.

---

### 📰 Personalized Daily Wine Briefing

OmniCave can aggregate wine-related information from external sources and personalize it according to the user's collection.

The Daily Wine Briefing may include:

- Global wine news
- Vintage reports
- Wine market trends
- Collection-specific insights
- Wines approaching their optimal drinking windows
- Relevant environmental information

A summarized briefing can also be delivered to the user's companion mobile application.

---

### 💰 Real-Time Wine Collection Value

OmniCave treats a wine collection not only as an inventory but also as a managed asset.

The system can integrate external wine market data to provide:

- Current market prices for stored wines
- Estimated total collection value
- Individual bottle value
- Historical market price trends
- Value appreciation visualization

---

### 📱 Multi-Device Integration

OmniCave provides a synchronized ecosystem across multiple devices.

The system is designed to support:

- Integrated transparent display
- Android application
- iOS application
- Multiple wine cellar units

Users can remotely:

- Browse their wine inventory
- Search for bottles
- View environmental conditions
- Receive notifications
- Manage inventory
- Access AI recommendations
- Control supported cellar settings

---

## 🏗️ System Architecture

```text
                         ┌─────────────────────┐
                         │        User         │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼
    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
    │ Transparent    │    │ Android / iOS  │    │ Wine Cellar    │
    │ Display        │    │ Applications   │    │ Sensors        │
    │ React + TS     │    │                │    │ + Cameras      │
    └────────┬───────┘    └────────┬───────┘    └────────┬───────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │   FastAPI Backend    │
                        │                      │
                        │ • Authentication     │
                        │ • Inventory          │
                        │ • Cellar Management  │
                        │ • Environmental Data │
                        │ • AI Integration     │
                        └──────────┬───────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                                 ▼
       ┌─────────────────────┐          ┌─────────────────────┐
       │     PostgreSQL      │          │ Cloud AI Services   │
       │                     │          │                     │
       │ • Users             │          │ • Vision AI        │
       │ • Wine Inventory    │          │ • LLM              │
       │ • Bottle Locations  │          │ • Multi-Agent AI   │
       │ • Sensor Data       │          │ • Recommendations  │
       └─────────────────────┘          └─────────────────────┘
```

---

## 🛠️ Technology Stack

### Backend

- **Python 3.12**
- **FastAPI**
- **SQLAlchemy**
- **PostgreSQL**
- **Docker**
- **Docker Compose**

### Integrated Display

- **React**
- **TypeScript**
- **Vite**

The display is designed to support integration with **webOS**-based smart appliances.

### Mobile Applications

#### Android

- **Kotlin**
- **Jetpack Compose**

#### iOS

- **Swift**
- **SwiftUI**

### AI & Cloud Services

- Cloud-hosted Large Language Models
- Multi-agent AI architecture
- External AI inference services for development and testing
- Server-side AI processing
- Wine recommendation and critic-persona dialogue generation

### Infrastructure

- **AWS EC2**
- **Vercel**
- **Docker**
- **GitHub**

---

## 📂 Project Structure

```text
omnicave/
│
├── backend/                # FastAPI backend services
├── frontend/               # Integrated transparent display
├── android/                # Android application
├── ios/                    # iOS application
├── ai/                     # AI integration and processing
├── docs/                   # Project documentation
│
├── docker-compose.yml
└── README.md
```

> The project structure may evolve as development progresses.

---

## 🎯 Project Goals

OmniCave aims to solve the gap between physical wine storage and digital wine management.

Our primary goals are to:

- Reduce manual wine inventory management
- Automatically synchronize physical and digital wine information
- Provide intelligent and personalized wine recommendations
- Monitor wine storage conditions
- Create an intuitive interaction experience through a transparent display
- Support multi-device and multi-cellar synchronization
- Transform a traditional wine cellar into an intelligent wine management ecosystem

---

## 👥 Team

| Member | Role | Responsibilities |
|---|---|---|
| **Naomi K. Fossaberg** | Backend & Cloud Developer | Develops the FastAPI backend, authentication system, PostgreSQL database, inventory and environmental monitoring APIs, Docker configuration, AWS deployment, and API documentation. |
| **Enkhbold Myagmarjav** | Integrated Display Developer | Designs and implements the React/TypeScript integrated display, including the inventory dashboard, cellar map, bottle details, environmental monitoring, and AI dialogue screens. |
| **Chiang Jun Han** | Mobile Application Developer | Develops the Android and iOS companion applications, including authentication, inventory management, cellar monitoring, notifications, and cross-device synchronization. |
| **Sungbin Bae** | AI Integration Developer | Implements wine recognition and bottle-localization processing, integrates external language-model services, coordinates critic-persona dialogues, develops recommendation prompts, and evaluates AI outputs. |

---

## 🚧 Project Status

**Currently under development.**

OmniCave is being developed as a software engineering project, and the system architecture, implementation, and supported features may evolve throughout the development process.

---

## 📄 License

This project is currently developed for educational and research purposes.

License information will be added in the future.
