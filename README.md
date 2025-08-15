# CampusCupid

CampusCupid is a modern, campus-focused dating and social web app designed for students to connect, match, chat, and call within their college or university community. Built with React and Firebase, it offers a seamless, mobile-friendly experience with real-time messaging and audio calls.

---

## 🚀 Features

- **User Profiles:**
  - Create and edit detailed profiles (name, pronouns, college, department, year, about, gender, interests, profile photo, and gallery images).
- **Explore/Discovery:**
  - Browse and swipe through other users' profiles (excluding yourself and already matched users).
  - Like/dislike users; mutual likes result in a match.
- **Matching System:**
  - See "It's a Match!" popups when you match with someone.
  - Matched users are filtered out from the explore list.
- **Messaging & Chat:**
  - Real-time chat with matches.
  - Copy and unsend messages.
  - Notifications for new messages.
- **Audio Calls:**
  - Start audio calls with your matches using WebRTC and Firebase for signaling.
  - Accept, decline, and end calls with robust error handling.
- **Requests & Match Management:**
  - View and accept incoming match requests.
  - Unmatch users to remove chat and connection.
- **Authentication:**
  - Secure login with Firebase Authentication (Google provider).
- **PWA & Offline Support:**
  - Works offline and can be installed as a Progressive Web App.

---

## 🛠️ Tech Stack

- **Frontend:** React (Hooks, Functional Components)
- **Backend/Database:** Firebase (Firestore, Storage, Auth)
- **Real-time:** Firestore onSnapshot, WebRTC (audio calls)
- **PWA:** Service Worker for offline support

---

## 📦 Getting Started

### Prerequisites
- Node.js (v16 or higher recommended)
- npm or yarn

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/CampusCupid.git
   cd CampusCupid
   ```
2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```
3. **Firebase Setup:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
   - Enable Authentication (Google), Firestore Database, and Storage.
   - Copy your Firebase config and replace it in `src/firebase.js`.

4. **Start the development server:**
   ```bash
   npm start
   # or
   yarn start
   ```
   The app will run at [http://localhost:3000](http://localhost:3000).

---

## 🌐 Deployment

- To build for production:
  ```bash
  npm run build
  # or
  yarn build
  ```
- To deploy to GitHub Pages:
  ```bash
  npm run deploy
  ```
  (Ensure the `homepage` field in `package.json` is set to your repo URL.)

---

## 🤝 Contributing

Contributions are welcome! Please open issues or submit pull requests for new features, bug fixes, or improvements.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙋‍♂️ Contact

For questions or support, open an issue or contact the maintainer at [your-email@example.com].

---

**Made with ❤️ for campus communities!** 