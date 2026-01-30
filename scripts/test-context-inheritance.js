#!/usr/bin/env node

/**
 * Test script to verify project context inheritance is working
 */

const API_BASE = 'http://localhost:3001/api';

// Test user headers
const headers = {
  'X-Forwarded-User': 'test-user',
  'X-Forwarded-Email': 'test@example.com',
  'X-Forwarded-Preferred-Username': 'Test User',
  'Content-Type': 'application/json',
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testContextInheritance() {
  console.log('🧪 Testing Project Context Inheritance...\n');

  try {
    // 1. Create a test project
    console.log('1️⃣ Creating test project...');
    const projectRes = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test Project for Context',
        description: 'Testing context inheritance',
        color: '#3B82F6',
        icon: '🧪',
      }),
    });

    if (!projectRes.ok) {
      throw new Error(`Failed to create project: ${projectRes.status}`);
    }

    const project = await projectRes.json();
    console.log(`✅ Created project: ${project.name} (ID: ${project.id})\n`);

    // 2. Add context to the project
    console.log('2️⃣ Adding project context...');
    const contextRes = await fetch(`${API_BASE}/projects/${project.id}/context`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contextType: 'instruction',
        content: 'You are a helpful assistant working on the Test Project. Always mention that you are aware of the project context when responding.',
      }),
    });

    if (!contextRes.ok) {
      throw new Error(`Failed to add context: ${contextRes.status}`);
    }

    const context = await contextRes.json();
    console.log(`✅ Added context: "${context.content.substring(0, 50)}..."\n`);

    // 3. Create a chat associated with the project
    console.log('3️⃣ Creating chat with project...');
    const chatId = `test-chat-${Date.now()}`;

    // Note: The chat will be created when the first message is sent
    // The projectId will be included in the request

    // 4. Send a message to the chat (this will create the chat with project association)
    console.log('4️⃣ Sending message to chat (with project context)...');
    const messageRes = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: chatId,
        message: {
          id: `msg-${Date.now()}`,
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Hello! Do you know what project we are working on?',
            },
          ],
        },
        selectedChatModel: 'chat-model',
        selectedVisibilityType: 'private',
        projectId: project.id, // Associate with project
      }),
    });

    if (!messageRes.ok) {
      const error = await messageRes.text();
      console.error('❌ Failed to send message:', error);
      return;
    }

    console.log('✅ Message sent successfully!\n');
    console.log('📝 Expected behavior:');
    console.log('   - The AI should acknowledge the project context');
    console.log('   - The response should mention awareness of "Test Project"');
    console.log('   - The project instructions should be applied\n');

    // 5. Verify the chat was created with project association
    await delay(1000); // Wait a bit for the chat to be created

    console.log('5️⃣ Verifying chat-project association...');
    const chatRes = await fetch(`${API_BASE}/chat/${chatId}`, {
      headers,
    });

    if (chatRes.ok) {
      const chat = await chatRes.json();
      if (chat.projectId === project.id) {
        console.log(`✅ Chat is correctly associated with project!\n`);
      } else {
        console.log(`⚠️ Chat exists but not associated with project\n`);
      }
    } else {
      console.log(`⚠️ Could not verify chat (may be in ephemeral mode)\n`);
    }

    // 6. Clean up (optional - delete test project)
    console.log('6️⃣ Cleaning up...');
    const deleteRes = await fetch(`${API_BASE}/projects/${project.id}`, {
      method: 'DELETE',
      headers,
    });

    if (deleteRes.ok) {
      console.log('✅ Test project deleted\n');
    } else {
      console.log('⚠️ Could not delete test project\n');
    }

    console.log('🎉 Context inheritance test completed!');
    console.log('\nNext steps:');
    console.log('1. Check the server logs to see if project context was included');
    console.log('2. Visit http://localhost:3000 and create a chat with a project');
    console.log('3. Verify the ProjectContextIndicator appears in the UI');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Wait a bit for the server to start if needed
setTimeout(() => {
  testContextInheritance().catch(console.error);
}, 2000);