# 🍳 BiteBot Backend [![Better Stack Badge](https://uptime.betterstack.com/status-badges/v3/monitor/26nhy.svg)](https://uptime.betterstack.com/?utm_source=status_badge)


**Intelligent Recipe Platform with Cost & Nutrition Insights**
## Backend URL
https://bitebotbackend.onrender.com/

## End Points
- Health Check Route -> /api/test
- Sign Up Route -> /api/user/register
- Log In Route -> /api/user/login
- Log Out Route -> /api/user/logout
- Profile Route -> /api/user/me

## Module Overview
A Node.js/Express.js backend divided into two core modules:

### User Management 👥
- Authentication (JWT), role-based access (user/cook/admin)  
- Profile management (user preferences, cook profiles)  
- Subscription handling (Razorpay integration)  
- Favorites system  

### Recipe Management 📜
- Recipe CRUD with AI-assisted search (NLP integration)  
- Nutrition/cost calculations  
- Admin moderation  

## Key Features
- 🔐 **Auth**: Secure JWT-based auth with role differentiation  
- 💰 **Subscriptions**: Monthly cook subscriptions via Razorpay  
- 📊 **User Profiles**: Dietary preferences, favorites, cook specialties  
- 🤖 **AI Search**: NLP-powered recipe discovery  
- 📦 **Database**: MongoDB with optimized schemas (Users, Recipes, Nutrition)  

## Tech Stack
| Category       | Technologies                     |
|----------------|----------------------------------|
| Backend        | Node.js, Express.js              |
| Database       | MongoDB (Atlas)                  |
| Auth           | JWT, Bcrypt                      |
| Payments       | Razorpay API                     |
| AI Integration | LLM APIs (GPT-4o/Gemini for NLP) |
| Storage        | Cloudinary (recipe images)       |

## Collaboration
- 🗂 **Clear Separation**: Independent yet integrated modules (User # 🍳 BiteBot Backend

**Intelligent Recipe Platform with Cost & Nutrition Insights**

## Module Overview
A Node.js/Express.js backend divided into two core modules:

### User Management 👥
- Authentication (JWT), role-based access (user/cook/admin)  
- Profile management (user preferences, cook profiles)  
- Subscription handling (Razorpay integration)  
- Favorites system  

### Recipe Management 📜 *(Handled by teammate)*
- Recipe CRUD with AI-assisted search (NLP integration)  
- Nutrition/cost calculations  
- Admin moderation  

## Key Features
- 🔐 **Auth**: Secure JWT-based auth with role differentiation  
- 💰 **Subscriptions**: Monthly cook subscriptions via Razorpay  
- 📊 **User Profiles**: Dietary preferences, favorites, cook specialties  
- 🤖 **AI Search**: NLP-powered recipe discovery  
- 📦 **Database**: MongoDB with optimized schemas (Users, Recipes, Nutrition)  

## Tech Stack
| Category       | Technologies                     |
|----------------|----------------------------------|
| Backend        | Node.js, Express.js              |
| Database       | MongoDB (Atlas)                  |
| Auth           | JWT, Bcrypt                      |
| Payments       | Razorpay API                     |
| AI Integration | LLM APIs (GPT-4o/Gemini for NLP) |
| Storage        | Cloudinary (recipe images)       |

## Collaboration
- 🗂 **Clear Separation**: Independent yet integrated modules (User ↔ Recipe)  
- 📝 **API Contracts**: Well-documented shared interfaces and middleware  
- 🔌 **Integration Points**:
  - Subscription checks for premium recipes  
  - User context injection for personalized results  
↔ Recipe)  
- 📝 **API Contracts**: Well-documented shared interfaces and middleware  
- 🔌 **Integration Points**:
  - Subscription checks for premium recipes  
  - User context injection for personalized results  