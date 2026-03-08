package com.chatroom.controller;

import com.chatroom.model.ChatMessage;
import com.chatroom.service.RoomManager;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;

@Controller
@RequiredArgsConstructor
public class ChatController {

    private final SimpMessageSendingOperations messagingTemplate;
    private final RoomManager roomManager;

    @MessageMapping("/chat/{roomCode}/sendMessage")
    public void sendMessage(@DestinationVariable String roomCode, @Payload ChatMessage chatMessage) {
        chatMessage.setUserCount(roomManager.getUserCount(roomCode));
        chatMessage.setActiveUsers(roomManager.getActiveUsers(roomCode));
        messagingTemplate.convertAndSend("/topic/room/" + roomCode, chatMessage);
    }

    @MessageMapping("/chat/{roomCode}/addUser")
    public void addUser(@DestinationVariable String roomCode, 
                        @Payload ChatMessage chatMessage,
                        SimpMessageHeaderAccessor headerAccessor) {
        
        // Add user in web socket session
        String sessionId = headerAccessor.getSessionId();
        roomManager.addUserToRoom(roomCode, chatMessage.getSender(), sessionId);
        
        chatMessage.setUserCount(roomManager.getUserCount(roomCode));
        chatMessage.setActiveUsers(roomManager.getActiveUsers(roomCode));
        messagingTemplate.convertAndSend("/topic/room/" + roomCode, chatMessage);
    }

    @MessageMapping("/chat/{roomCode}/typing")
    public void typing(@DestinationVariable String roomCode, @Payload ChatMessage chatMessage) {
        chatMessage.setUserCount(roomManager.getUserCount(roomCode));
        chatMessage.setActiveUsers(roomManager.getActiveUsers(roomCode));
        messagingTemplate.convertAndSend("/topic/room/" + roomCode, chatMessage);
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        
        String roomCode = roomManager.getRoomFromSession(sessionId);
        String username = roomManager.getUsernameFromSession(sessionId);

        if (roomCode != null && username != null) {
            roomManager.removeUserSession(sessionId);

            ChatMessage leaveMessage = ChatMessage.builder()
                    .type(ChatMessage.MessageType.LEAVE)
                    .sender(username)
                    .roomCode(roomCode)
                    .userCount(roomManager.getUserCount(roomCode))
                    .activeUsers(roomManager.getActiveUsers(roomCode))
                    .build();

            messagingTemplate.convertAndSend("/topic/room/" + roomCode, leaveMessage);
        }
    }

    // HTTP Endpoint to generate a room code
    @GetMapping("/api/room/create")
    @ResponseBody
    public Map<String, String> createRoom() {
        String code = roomManager.generateRoomCode();
        roomManager.createRoom(code);
        return Map.of("roomCode", code);
    }

    // HTTP Endpoint to check if a room exists
    @GetMapping("/api/room/check/{roomCode}")
    @ResponseBody
    public Map<String, Boolean> checkRoom(@PathVariable String roomCode) {
        return Map.of("exists", roomManager.roomExists(roomCode));
    }
}
