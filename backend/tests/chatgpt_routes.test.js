// CSCE 3444 White-Box Testing
// ChatGPT GPT-5.6 Luna
// Tests for remaining Express routes

jest.mock("../src/middleware/authMiddleware", () => {
  return (req, res, next) => {
    req.user = { id: "user1", email: "test@example.com" };
    next();
  };
});

jest.mock("../src/services/supabase", () => ({
  from: jest.fn(),
}));

jest.mock("../src/services/aiService", () => ({
  generateQuestions: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock("../src/services/llmService", () => ({
  generateFollowUp: jest.fn(),
  transcribeAudio: jest.fn(),
}));

jest.mock("../src/services/resumeService", () => ({
  extractResumeText: jest.fn(),
}));

jest.mock("../src/services/sessionService", () => ({
  saveQuestion: jest.fn(),
}));

const mockRefreshTokens = new Set();
jest.mock("../src/controllers/authController", () => ({
    refreshTokens: mockRefreshTokens,
  register: jest.fn((req, res) =>
    res.status(201).json({ message: "registered" })
  ),
  login: jest.fn((req, res) =>
    res.status(200).json({ message: "logged in" })
  ),
  logout: jest.fn((req, res) =>
    res.status(200).json({ message: "logged out" })
  ),
  forgotPassword: jest.fn((req, res) =>
    res.status(200).json({ message: "forgot password" })
  ),
  resetPassword: jest.fn((req, res) =>
    res.status(200).json({ message: "reset password" })
  ),
}));

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
  sign: jest.fn(),
}));

const express = require("express");
const request = require("supertest");

const supabase = require("../src/services/supabase");
const {
  generateQuestions,
  getSession,
} = require("../src/services/aiService");
const {
  generateFollowUp,
  transcribeAudio,
} = require("../src/services/llmService");
const {
  extractResumeText,
} = require("../src/services/resumeService");
const {
  saveQuestion,
} = require("../src/services/sessionService");

const authRouter = require("../src/routes/auth");
const profileRouter = require("../src/routes/profile");
const questionsRouter = require("../src/routes/questions");
const sessionsRouter = require("../src/routes/sessions");

const jwt = require("jsonwebtoken");

function makeApp(router, mountPath) {
  const app = express();

  app.use(express.json());
  app.use(mountPath, router);

  return app;
}

describe("profile route white-box tests", () => {
  const app = makeApp(profileRouter, "/api/profile");

  test("TC-PROFILE-001: setup accepts complete profile", async () => {
    const response = await request(app)
      .post("/api/profile/setup")
      .send({
        name: "Test User",
        educationLevel: "Bachelor",
        targetRole: "Developer",
        targetIndustry: "Technology",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Profile saved successfully");
    expect(response.body.profile.name).toBe("Test User");
  });

  test("TC-PROFILE-002: setup rejects missing name", async () => {
    const response = await request(app)
      .post("/api/profile/setup")
      .send({
        educationLevel: "Bachelor",
        targetRole: "Developer",
        targetIndustry: "Technology",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("All profile fields are required");
  });

  test("TC-PROFILE-003: setup rejects missing education level", async () => {
    const response = await request(app)
      .post("/api/profile/setup")
      .send({
        name: "Test User",
        targetRole: "Developer",
        targetIndustry: "Technology",
      });

    expect(response.status).toBe(400);
  });

  test("TC-PROFILE-004: setup rejects missing target role", async () => {
    const response = await request(app)
      .post("/api/profile/setup")
      .send({
        name: "Test User",
        educationLevel: "Bachelor",
        targetIndustry: "Technology",
      });

    expect(response.status).toBe(400);
  });

  test("TC-PROFILE-005: setup rejects missing target industry", async () => {
    const response = await request(app)
      .post("/api/profile/setup")
      .send({
        name: "Test User",
        educationLevel: "Bachelor",
        targetRole: "Developer",
      });

    expect(response.status).toBe(400);
  });
});

describe("questions route white-box tests", () => {
  const app = makeApp(questionsRouter, "/api/questions");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("TC-Q-001: generate returns generated questions", async () => {
    generateQuestions.mockResolvedValue({
      sessionId: 1,
      questions: [
        {
          id: "q1",
          question: "Test?",
          type: "technical",
          difficulty: "easy",
          tips: "Tips",
        },
      ],
    });

    const response = await request(app)
      .post("/api/questions/generate")
      .send({
        interviewType: "technical",
        role: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      });

    expect(response.status).toBe(200);
    expect(response.body.questions).toBeDefined();
    expect(generateQuestions).toHaveBeenCalled();
  });

  test("TC-Q-002: generate handles AI service unavailable", async () => {
    generateQuestions.mockRejectedValue(
      new Error("AI_SERVICE_UNAVAILABLE")
    );

    const response = await request(app)
      .post("/api/questions/generate")
      .send({
        interviewType: "technical",
        role: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      });

    expect(response.status).toBe(503);
  });

  test("TC-Q-003: generate handles invalid AI response", async () => {
    generateQuestions.mockRejectedValue(
      new Error("AI_RESPONSE_PARSE_ERROR")
    );

    const response = await request(app)
      .post("/api/questions/generate")
      .send({
        interviewType: "technical",
        role: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      });

    expect(response.status).toBe(502);
  });

  test("TC-Q-004: generate handles generic error", async () => {
    generateQuestions.mockRejectedValue(
      new Error("Unexpected failure")
    );

    const response = await request(app)
      .post("/api/questions/generate")
      .send({
        interviewType: "technical",
        role: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Unexpected failure");
  });

  test("TC-Q-005: session returns stored session", async () => {
    getSession.mockResolvedValue({
      id: 1,
      questions: [],
    });

    const response = await request(app)
      .get("/api/questions/session/1");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(1);
  });

  test("TC-Q-006: session returns 404 when not found", async () => {
    getSession.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/questions/session/999");

    expect(response.status).toBe(404);
  });

  test("TC-Q-007: session handles service error", async () => {
    getSession.mockRejectedValue(
      new Error("Session lookup failed")
    );

    const response = await request(app)
      .get("/api/questions/session/1");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Session lookup failed");
  });

  test("TC-Q-008: follow-up returns generated follow-up", async () => {
    generateFollowUp.mockResolvedValue(
      "Can you give an example?"
    );

    const response = await request(app)
      .post("/api/questions/follow-up")
      .send({
        question: "Tell me about a project.",
        answer: "It was difficult.",
        role: "Developer",
        industry: "Technology",
      });

    expect(response.status).toBe(200);
    expect(response.body.followUpQuestion).toBe(
      "Can you give an example?"
    );
  });

  test("TC-Q-009: follow-up returns null when no follow-up needed", async () => {
    generateFollowUp.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/questions/follow-up")
      .send({
        question: "Tell me about yourself.",
        answer: "I am a developer.",
      });

    expect(response.status).toBe(200);
    expect(response.body.followUpQuestion).toBeNull();
  });

  test("TC-Q-010: follow-up handles AI unavailable", async () => {
    generateFollowUp.mockRejectedValue(
      new Error("AI_SERVICE_UNAVAILABLE")
    );

    const response = await request(app)
      .post("/api/questions/follow-up")
      .send({
        question: "Question",
        answer: "Answer",
      });

    expect(response.status).toBe(503);
  });

  test("TC-Q-011: follow-up handles generic error", async () => {
    generateFollowUp.mockRejectedValue(
      new Error("Follow-up failed")
    );

    const response = await request(app)
      .post("/api/questions/follow-up")
      .send({
        question: "Question",
        answer: "Answer",
      });

    expect(response.status).toBe(500);
  });
});

describe("sessions route white-box tests", () => {
  const app = makeApp(sessionsRouter, "/api/sessions");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function sessionQuery(result) {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue(result),
      }),
    };
  }

  test("TC-SR-001: list sessions returns data", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [{ id: 1 }],
              error: null,
            }),
          }),
        }),
      }),
    });

    const response = await request(app)
      .get("/api/sessions/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 1 }]);
  });

  test("TC-SR-002: list sessions returns empty array for null data", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    });

    const response = await request(app)
      .get("/api/sessions/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("TC-SR-003: list sessions handles database error", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: new Error("List failed"),
            }),
          }),
        }),
      }),
    });

    const response = await request(app)
      .get("/api/sessions/");

    expect(response.status).toBe(500);
  });

  test("TC-SR-004: save question returns created question", async () => {
    saveQuestion.mockResolvedValue({
      id: 10,
      question_text: "Explain REST.",
    });

    const response = await request(app)
      .post("/api/sessions/1/questions")
      .send({
        questionText: "Explain REST.",
        questionType: "technical",
        difficulty: "medium",
        tips: "Discuss HTTP.",
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(10);
    expect(saveQuestion).toHaveBeenCalledWith(
      "1",
      "Explain REST.",
      "technical",
      "medium",
      "Discuss HTTP."
    );
  });

  test("TC-SR-005: save question handles service error", async () => {
    saveQuestion.mockRejectedValue(
      new Error("Question save failed")
    );

    const response = await request(app)
      .post("/api/sessions/1/questions")
      .send({
        questionText: "Question",
        questionType: "technical",
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Question save failed");
  });

  test("TC-SR-006: config rejects invalid interview type", async () => {
    const response = await request(app)
      .post("/api/sessions/config")
      .send({
        interviewType: "invalid",
        targetRole: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
      });

    expect(response.status).toBe(400);
  });

  test("TC-SR-007: config rejects missing target role", async () => {
    const response = await request(app)
      .post("/api/sessions/config")
      .send({
        interviewType: "technical",
        industry: "Technology",
        experienceLevel: "entry",
      });

    expect(response.status).toBe(400);
  });

  test("TC-SR-008: config rejects invalid experience level", async () => {
    const response = await request(app)
      .post("/api/sessions/config")
      .send({
        interviewType: "technical",
        targetRole: "Developer",
        industry: "Technology",
        experienceLevel: "invalid",
      });

    expect(response.status).toBe(400);
  });

  test("TC-SR-009: config creates session successfully", async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 5,
              status: "configuring",
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await request(app)
      .post("/api/sessions/config")
      .send({
        interviewType: "technical",
        targetRole: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
      });

    expect(response.status).toBe(201);
    expect(response.body.sessionId).toBe(5);
  });

  test("TC-SR-010: config handles database error", async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: new Error("Create failed"),
          }),
        }),
      }),
    });

    const response = await request(app)
      .post("/api/sessions/config")
      .send({
        interviewType: "technical",
        targetRole: "Developer",
        industry: "Technology",
        experienceLevel: "entry",
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Failed to create session");
  });

  test("TC-SR-011: get session returns 404 when missing", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .get("/api/sessions/1");

    expect(response.status).toBe(404);
  });

  test("TC-SR-012: get session denies another user", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [
            {
              id: 1,
              user_id: "different-user",
            },
          ],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .get("/api/sessions/1");

    expect(response.status).toBe(403);
  });

  test("TC-SR-013: get session returns session and responses", async () => {
    let call = 0;

    supabase.from.mockImplementation((table) => {
      call++;

      if (table === "sessions") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 1,
                  user_id: "user1",
                },
              ],
              error: null,
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [{ id: 10 }],
              error: null,
            }),
          }),
        }),
      };
    });

    const response = await request(app)
      .get("/api/sessions/1");

    expect(response.status).toBe(200);
    expect(response.body.session.id).toBe(1);
    expect(response.body.responses).toEqual([{ id: 10 }]);
    expect(call).toBe(2);
  });

  test("TC-SR-014: pause returns 404 for missing session", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/pause");

    expect(response.status).toBe(404);
  });

  test("TC-SR-015: pause denies another user", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "other" }],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/pause");

    expect(response.status).toBe(403);
  });

  test("TC-SR-016: pause updates session", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "user1" }],
          error: null,
        }),
      }),
    });

    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        error: null,
      }),
    });

    supabase.from.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "user1" }],
          error: null,
        }),
      }),
    }));

    supabase.from.mockImplementationOnce(() => ({
      update,
    }));

    const response = await request(app)
      .patch("/api/sessions/1/pause");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Session paused");
  });

  test("TC-SR-017: abandon returns 404 for missing session", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/abandon");

    expect(response.status).toBe(404);
  });

  test("TC-SR-018: abandon denies another user", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "other" }],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/abandon");

    expect(response.status).toBe(403);
  });

  test("TC-SR-019: abandon updates session", async () => {
    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        error: null,
      }),
    });

    supabase.from
      .mockImplementationOnce(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ user_id: "user1" }],
            error: null,
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        update,
      }));

    const response = await request(app)
      .patch("/api/sessions/1/abandon");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Session abandoned");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "abandoned",
        partial: true,
      })
    );
  });

  test("TC-SR-020: feedback viewed returns 404 when missing", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/feedback-viewed");

    expect(response.status).toBe(404);
  });

  test("TC-SR-021: feedback viewed denies another user", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "other" }],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .patch("/api/sessions/1/feedback-viewed");

    expect(response.status).toBe(403);
  });

  test("TC-SR-022: feedback viewed succeeds", async () => {
    supabase.from
      .mockImplementationOnce(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ user_id: "user1" }],
            error: null,
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      }));

    const response = await request(app)
      .patch("/api/sessions/1/feedback-viewed");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Feedback marked as viewed"
    );
  });

  test("TC-SR-023: audio route rejects missing audio", async () => {
    const response = await request(app)
      .post("/api/sessions/1/audio");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "No audio file provided."
    );
  });

  test("TC-SR-024: audio route returns transcription", async () => {
    transcribeAudio.mockResolvedValue("Hello transcript");

    const response = await request(app)
      .post("/api/sessions/1/audio")
      .attach(
        "audio",
        Buffer.from("fake audio"),
        {
          filename: "audio.webm",
          contentType: "audio/webm",
        }
      );

    expect(response.status).toBe(200);
    expect(response.body.transcript).toBe("Hello transcript");
  });

  test("TC-SR-025: audio route converts transcription failure to 503", async () => {
    transcribeAudio.mockRejectedValue(
      new Error("TRANSCRIPTION_FAILED")
    );

    const response = await request(app)
      .post("/api/sessions/1/audio")
      .attach(
        "audio",
        Buffer.from("fake audio"),
        {
          filename: "audio.webm",
          contentType: "audio/webm",
        }
      );

    expect(response.status).toBe(503);
  });

  test("TC-SR-026: audio route rejects invalid file type", async () => {
    const response = await request(app)
      .post("/api/sessions/1/audio")
      .attach(
        "audio",
        Buffer.from("not audio"),
        {
          filename: "test.txt",
          contentType: "text/plain",
        }
      );

    expect(response.status).not.toBe(200);
  });

  test("TC-SR-027: responses reject missing questionId", async () => {
    const response = await request(app)
      .post("/api/sessions/1/responses")
      .send({
        responseText: "This response is long enough.",
      });

    expect(response.status).toBe(400);
  });

  test("TC-SR-028: responses reject short responseText", async () => {
    const response = await request(app)
      .post("/api/sessions/1/responses")
      .send({
        questionId: "1",
        responseText: "short",
      });

    expect(response.status).toBe(400);
  });

  test("TC-SR-029: responses return 404 for missing session", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .post("/api/sessions/1/responses")
      .send({
        questionId: "1",
        responseText: "This is a sufficiently long answer.",
      });

    expect(response.status).toBe(404);
  });

  test("TC-SR-030: responses deny another user's session", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ user_id: "other", status: "ready" }],
          error: null,
        }),
      }),
    });

    const response = await request(app)
      .post("/api/sessions/1/responses")
      .send({
        questionId: "1",
        responseText: "This is a sufficiently long answer.",
      });

    expect(response.status).toBe(403);
  });

  test("TC-SR-031: responses save successfully", async () => {
    let call = 0;

    supabase.from.mockImplementation((table) => {
      call++;

      if (table === "sessions" && call === 1) {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  user_id: "user1",
                  status: "ready",
                },
              ],
              error: null,
            }),
          }),
        };
      }

      if (table === "responses") {
        return {
          insert: jest.fn().mockResolvedValue({
            error: null,
          }),
        };
      }

      return {
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
          }),
        }),
      };
    });

    const response = await request(app)
      .post("/api/sessions/1/responses")
      .send({
        questionId: "1",
        responseText: "This is a sufficiently long answer.",
      });

    expect(response.status).toBe(201);
    expect(response.body.responseId).toBeDefined();
  });
});

describe("auth refresh route white-box tests", () => {
  const app = makeApp(authRouter, "/api/auth");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("TC-AUTH-REFRESH-001: missing refresh token returns 401", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({});

    expect(response.status).toBe(401);
  });

  test("TC-AUTH-REFRESH-002: unstored refresh token returns 401", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: "not-stored",
      });

    expect(response.status).toBe(401);
  });

  test("TC-AUTH-REFRESH-003: stored valid refresh token returns access token", async () => {
    const controller = require("../src/controllers/authController");

    controller.refreshTokens.add("valid-refresh");

    jwt.verify.mockReturnValue({
      id: "user1",
      email: "test@example.com",
    });

    jwt.sign.mockReturnValue("new-access-token");

    const response = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: "valid-refresh",
      });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe("new-access-token");
  });

  test("TC-AUTH-REFRESH-004: invalid JWT returns 403", async () => {
    const controller = require("../src/controllers/authController");

    controller.refreshTokens.add("bad-refresh");

    jwt.verify.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    const response = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: "bad-refresh",
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "Refresh token expired or invalid"
    );
  });
});