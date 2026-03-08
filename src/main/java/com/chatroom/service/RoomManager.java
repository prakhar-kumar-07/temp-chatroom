package com.chatroom.service;

import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomManager {

    // Map of RoomCode -> Set of Usernames
    private final ConcurrentHashMap<String, Set<String>> rooms = new ConcurrentHashMap<>();

    // Map of SessionId -> RoomCode
    private final ConcurrentHashMap<String, String> sessionRooms = new ConcurrentHashMap<>();

    // Map of SessionId -> Username
    private final ConcurrentHashMap<String, String> sessionUsers = new ConcurrentHashMap<>();

    public String generateRoomCode() {
        String characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            int index = (int) (Math.random() * characters.length());
            code.append(characters.charAt(index));
        }
        return code.toString();
    }

    public boolean roomExists(String roomCode) {
        return rooms.containsKey(roomCode);
    }

    public synchronized void createRoom(String roomCode) {
        rooms.putIfAbsent(roomCode, ConcurrentHashMap.newKeySet());
    }

    public synchronized void addUserToRoom(String roomCode, String username, String sessionId) {
        if (!roomExists(roomCode)) {
            createRoom(roomCode);
        }
        rooms.get(roomCode).add(username);
        sessionRooms.put(sessionId, roomCode);
        sessionUsers.put(sessionId, username);
    }

    public synchronized void removeUserSession(String sessionId) {
        String roomCode = sessionRooms.remove(sessionId);
        String username = sessionUsers.remove(sessionId);

        if (roomCode != null && username != null && rooms.containsKey(roomCode)) {
            rooms.get(roomCode).remove(username);
            
            // Clean up room if empty
            if (rooms.get(roomCode).isEmpty()) {
                rooms.remove(roomCode);
            }
        }
    }

    public java.util.Set<String> getActiveUsers(String roomCode) {
        if (roomExists(roomCode)) {
            return rooms.get(roomCode);
        }
        return java.util.Collections.emptySet();
    }

    public int getUserCount(String roomCode) {
        if (roomExists(roomCode)) {
            return rooms.get(roomCode).size();
        }
        return 0;
    }

    public String getRoomFromSession(String sessionId) {
        return sessionRooms.get(sessionId);
    }

    public String getUsernameFromSession(String sessionId) {
        return sessionUsers.get(sessionId);
    }
}
