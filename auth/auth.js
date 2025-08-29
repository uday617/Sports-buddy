// auth/auth.js

import { auth } from "../firebase/firebase-config.js";

// Handle login
export function loginUser(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

// Handle register
export function registerUser(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}

// Handle logout
export function logoutUser() {
  return auth.signOut();
}

