// CSCE 3444 White-Box Testing
// ChatGPT GPT-5.6 Luna
// Tests for remaining service modules

const mockOpenAIClient = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
  audio: {
    transcriptions: {
      create: jest.fn(),
    },
  },
};

jest.mock("openai", () => {
  const OpenAI = jest.fn(() => mockOpenAIClient);
  OpenAI.toFile = jest.fn();
  return OpenAI;
});

jest.mock("../src/services/supabase", () => ({
  from: jest.fn(),
}));

jest.mock("pdf-parse", () => jest.fn());

const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const supabase = require("../src/services/supabase");

const {
  generateQuestions: generateLLMQuestions,
  generateFollowUp,
  transcribeAudio,
} = require("../src/services/llmService");

const sessionService = require("../src/services/sessionService");

const {
  generateQuestions: generateAIQuestions,
} = require("../src/services/aiService");

const { extractResumeText } = require("../src/services/resumeService");

describe("llmService white-box tests", () => {
  let client;
  let createCompletion;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "";
    client = mockOpenAIClient;
    createCompletion = client.chat.completions.create;
    createCompletion.mockReset();
    client.audio.transcriptions.create.mockReset();
    OpenAI.toFile.mockReset();
  });

  test("TC-LM-001: generateQuestions rejects count below 8", async () => {
    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 7,
      })
    ).rejects.toThrow("Question count must be between 8 and 12");
  });

  test("TC-LM-002: generateQuestions rejects count above 12", async () => {
    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 13,
      })
    ).rejects.toThrow("Question count must be between 8 and 12");
  });

  test("TC-LM-003: generateQuestions returns mock questions when API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await generateLLMQuestions({
      interviewType: "technical",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    expect(result).toHaveLength(6);
    expect(result.every((q) => q.type === "technical")).toBe(true);
  });

  test("TC-LM-004: behavioral mock questions use behavioral pool", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await generateLLMQuestions({
      interviewType: "behavioral",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    expect(result).toHaveLength(6);
    expect(result.every((q) => q.type === "behavioral")).toBe(true);
  });

  test("TC-LM-005: mixed mock questions contain behavioral and technical questions", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await generateLLMQuestions({
      interviewType: "mixed",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    expect(result).toHaveLength(8);

    expect(result.some((q) => q.type === "behavioral")).toBe(true);
    expect(result.some((q) => q.type === "technical")).toBe(true);
  });

  test("TC-LM-006: API-key path sends request to LLM and parses JSON", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                id: "q1",
                question: "Explain REST APIs.",
                type: "technical",
                difficulty: "medium",
                tips: "Discuss HTTP methods.",
              },
            ]),
          },
        },
      ],
    });

    const result = await generateLLMQuestions({
      interviewType: "technical",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("q1");
    expect(createCompletion).toHaveBeenCalled();
  });

  test("TC-LM-007: resume text is included when supplied", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                id: "q1",
                question: "Tell me about your experience.",
                type: "behavioral",
                difficulty: "medium",
                tips: "Use examples.",
              },
            ]),
          },
        },
      ],
    });

    await generateLLMQuestions({
      interviewType: "behavioral",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      resumeText: "Five years of software development experience.",
      count: 8,
    });

    const call = createCompletion.mock.calls[0][0];

    expect(call.messages[1].content).toContain(
      "Five years of software development experience."
    );
  });

  test("TC-LM-008: LLM response that is not an array throws parse error", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ question: "not an array" }),
          },
        },
      ],
    });

    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      })
    ).rejects.toThrow("AI_RESPONSE_PARSE_ERROR");
  });

  test("TC-LM-009: malformed JSON response throws parse error", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: "{not valid json}",
          },
        },
      ],
    });

    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      })
    ).rejects.toThrow("AI_RESPONSE_PARSE_ERROR");
  });

  test("TC-LM-010: JSON code fences are removed before parsing", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '```json\n[{"id":"q1","question":"Test?","type":"technical","difficulty":"easy","tips":"Test tips"}]\n```',
          },
        },
      ],
    });

    const result = await generateLLMQuestions({
      interviewType: "technical",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    expect(result[0].id).toBe("q1");
  });

  test("TC-LM-011: missing LLM content eventually throws AI service unavailable", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {},
        },
      ],
    });

    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      })
    ).rejects.toThrow("AI_SERVICE_UNAVAILABLE");
  });

  test("TC-LM-012: non-retryable LLM error immediately becomes unavailable", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    const error = new Error("Bad request");
    error.status = 400;

    createCompletion.mockRejectedValue(error);

    await expect(
      generateLLMQuestions({
        interviewType: "technical",
        role: "Software Engineer",
        industry: "Technology",
        experienceLevel: "entry",
        count: 8,
      })
    ).rejects.toThrow("AI_SERVICE_UNAVAILABLE");

    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

  test("TC-LM-013: 429 error retries before succeeding", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    const rateLimitError = new Error("Rate limited");
    rateLimitError.status = 429;

    createCompletion
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  id: "q1",
                  question: "Retry test",
                  type: "technical",
                  difficulty: "easy",
                  tips: "Retry",
                },
              ]),
            },
          },
        ],
      });

    jest.useFakeTimers();

    const promise = generateLLMQuestions({
      interviewType: "technical",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;

    jest.useRealTimers();

    expect(result[0].id).toBe("q1");
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  test("TC-LM-014: 5xx error retries before succeeding", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    const serverError = new Error("Server error");
    serverError.status = 500;

    createCompletion
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  id: "q1",
                  question: "Server retry",
                  type: "technical",
                  difficulty: "easy",
                  tips: "Retry",
                },
              ]),
            },
          },
        ],
      });

    jest.useFakeTimers();

    const promise = generateLLMQuestions({
      interviewType: "technical",
      role: "Software Engineer",
      industry: "Technology",
      experienceLevel: "entry",
      count: 8,
    });

    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;

    jest.useRealTimers();

    expect(result[0].id).toBe("q1");
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  test("TC-LM-015: retryable errors fail after three attempts", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";

  const serverError = new Error("Server unavailable");
  serverError.status = 503;

  createCompletion.mockRejectedValue(serverError);

  jest.useFakeTimers();

  const promise = generateLLMQuestions({
    interviewType: "technical",
    role: "Software Engineer",
    industry: "Technology",
    experienceLevel: "entry",
    count: 8,
  });

  const expectation = expect(promise).rejects.toThrow(
    "AI_SERVICE_UNAVAILABLE"
  );

  await jest.runAllTimersAsync();
  await expectation;

  expect(createCompletion).toHaveBeenCalledTimes(3);

  jest.useRealTimers();
});

  test("TC-LM-016: generateFollowUp returns null when shouldFollowUp is false", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              shouldFollowUp: false,
              followUpQuestion: null,
            }),
          },
        },
      ],
    });

    const result = await generateFollowUp(
      "Tell me about yourself",
      "I have five years of experience.",
      {
        role: "Software Engineer",
        industry: "Technology",
      }
    );

    expect(result).toBeNull();
  });

  test("TC-LM-017: generateFollowUp returns question when follow-up is requested", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              shouldFollowUp: true,
              followUpQuestion: "Can you give a specific example?",
            }),
          },
        },
      ],
    });

    const result = await generateFollowUp(
      "Tell me about a project",
      "It was challenging.",
      {
        role: "Software Engineer",
        industry: "Technology",
      }
    );

    expect(result).toBe("Can you give a specific example?");
  });

  test("TC-LM-018: generateFollowUp returns null when follow-up question is missing", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              shouldFollowUp: true,
              followUpQuestion: null,
            }),
          },
        },
      ],
    });

    const result = await generateFollowUp(
      "Tell me about a project",
      "It was challenging."
    );

    expect(result).toBeNull();
  });

  test("TC-LM-019: transcribeAudio sends audio to Whisper", async () => {
    const mockFile = { name: "audio.webm" };

    OpenAI.toFile.mockResolvedValue(mockFile);

    const transcription =
      client.audio.transcriptions.create;

    transcription.mockResolvedValue({
      text: "This is the transcript.",
    });

    const result = await transcribeAudio(
      Buffer.from("audio"),
      "audio.webm",
      "audio/webm"
    );

    expect(OpenAI.toFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      "audio.webm",
      { type: "audio/webm" }
    );

    expect(transcription).toHaveBeenCalledWith({
      file: mockFile,
      model: "openai/whisper-large-v3",
    });

    expect(result).toBe("This is the transcript.");
  });

  test("TC-LM-020: transcribeAudio converts transcription errors", async () => {
    OpenAI.toFile.mockResolvedValue({ name: "audio.webm" });

    client.audio.transcriptions.create.mockRejectedValue(
      new Error("Whisper unavailable")
    );

    await expect(
      transcribeAudio(
        Buffer.from("audio"),
        "audio.webm",
        "audio/webm"
      )
    ).rejects.toThrow("TRANSCRIPTION_FAILED");
  });
});

describe("sessionService white-box tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("TC-SS-001: createSession inserts and returns created session", async () => {
    const session = { id: 1, user_id: "user1" };

    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: [session],
          error: null,
        }),
      }),
    });

    const result = await sessionService.createSession(
      "user1",
      "technical",
      "Developer",
      "Technology"
    );

    expect(result).toEqual(session);
  });

  test("TC-SS-002: createSession throws database error", async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Insert failed"),
        }),
      }),
    });

    await expect(
      sessionService.createSession(
        "user1",
        "technical",
        "Developer",
        "Technology"
      )
    ).rejects.toThrow("Insert failed");
  });

  test("TC-SS-003: saveQuestion includes optional difficulty and tips", async () => {
    const question = { id: 5 };

    const insert = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [question],
        error: null,
      }),
    });

    supabase.from.mockReturnValue({ insert });

    const result = await sessionService.saveQuestion(
      1,
      "Explain REST.",
      "technical",
      "medium",
      "Mention HTTP."
    );

    expect(result).toEqual(question);

    expect(insert).toHaveBeenCalledWith([
      {
        session_id: 1,
        question_text: "Explain REST.",
        question_type: "technical",
        difficulty: "medium",
        tips: "Mention HTTP.",
      },
    ]);
  });

  test("TC-SS-004: saveQuestion omits null optional fields", async () => {
    const insert = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [{ id: 1 }],
        error: null,
      }),
    });

    supabase.from.mockReturnValue({ insert });

    await sessionService.saveQuestion(
      1,
      "Question",
      "technical",
      null,
      null
    );

    expect(insert).toHaveBeenCalledWith([
      {
        session_id: 1,
        question_text: "Question",
        question_type: "technical",
      },
    ]);
  });

  test("TC-SS-005: saveQuestion throws database error", async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Question insert failed"),
        }),
      }),
    });

    await expect(
      sessionService.saveQuestion(1, "Question", "technical")
    ).rejects.toThrow("Question insert failed");
  });

  test("TC-SS-006: saveResponse inserts response and returns it", async () => {
    const response = { id: 9 };

    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: [response],
          error: null,
        }),
      }),
    });

    const result = await sessionService.saveResponse(
      1,
      9,
      "user1",
      "My answer",
      "text"
    );

    expect(result).toEqual(response);
  });

  test("TC-SS-007: saveResponse throws database error", async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Response insert failed"),
        }),
      }),
    });

    await expect(
      sessionService.saveResponse(
        1,
        9,
        "user1",
        "Answer",
        "text"
      )
    ).rejects.toThrow("Response insert failed");
  });

  test("TC-SS-008: getSession returns null when session does not exist", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const result = await sessionService.getSession(999);

    expect(result).toBeNull();
  });

  test("TC-SS-009: getSession returns session with mapped questions", async () => {
    const session = {
      id: 1,
      target_role: "Developer",
    };

    const questions = [
      {
        id: 10,
        question_text: "Explain REST.",
        question_type: "technical",
        difficulty: "medium",
        tips: "Discuss HTTP.",
      },
    ];

    let call = 0;

    supabase.from.mockImplementation((table) => {
      call++;

      if (table === "sessions") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [session],
              error: null,
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: questions,
            error: null,
          }),
        }),
      };
    });

    const result = await sessionService.getSession(1);

    expect(result).toEqual({
      ...session,
      questions: [
        {
          id: 10,
          question: "Explain REST.",
          type: "technical",
          difficulty: "medium",
          tips: "Discuss HTTP.",
        },
      ],
    });

    expect(call).toBe(2);
  });

  test("TC-SS-010: getSession throws when session query fails", async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Session query failed"),
        }),
      }),
    });

    await expect(
      sessionService.getSession(1)
    ).rejects.toThrow("Session query failed");
  });

  test("TC-SS-011: getSession throws when question query fails", async () => {
    let call = 0;

    supabase.from.mockImplementation((table) => {
      call++;

      if (table === "sessions") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: 1 }],
              error: null,
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: new Error("Question query failed"),
          }),
        }),
      };
    });

    await expect(
      sessionService.getSession(1)
    ).rejects.toThrow("Question query failed");
  });
});

describe("aiService white-box tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("TC-AI-001: module exposes generateQuestions", () => {
    expect(typeof generateAIQuestions).toBe("function");
  });

  test("TC-AI-002: invalid LLM question shape is rejected", async () => {
    jest.resetModules();

    jest.doMock("../src/services/llmService", () => ({
      generateQuestions: jest.fn().mockResolvedValue([
        {
          id: "q1",
          question: "Bad question",
          type: "invalid",
          difficulty: "medium",
          tips: "tips",
        },
      ]),
    }));

    jest.doMock("../src/services/sessionService", () => ({
      createSession: jest.fn(),
      saveQuestion: jest.fn(),
      getSession: jest.fn(),
    }));

    const {
      generateQuestions: testGenerateQuestions,
    } = require("../src/services/aiService");

    await expect(
      testGenerateQuestions("user1", {
        interviewType: "technical",
        role: "Developer",
        industry: "Technology",
      })
    ).rejects.toThrow("AI_RESPONSE_PARSE_ERROR");

    jest.resetModules();
  });
});

describe("resumeService white-box tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("TC-RS-001: empty buffer returns empty string", async () => {
    await expect(extractResumeText(null)).resolves.toBe("");
    await expect(extractResumeText(Buffer.alloc(0))).resolves.toBe("");
    expect(pdfParse).not.toHaveBeenCalled();
  });

  test("TC-RS-002: valid PDF returns parsed text", async () => {
    pdfParse.mockResolvedValue({
      text: "Resume text",
    });

    const result = await extractResumeText(
      Buffer.from("fake pdf")
    );

    expect(result).toBe("Resume text");
    expect(pdfParse).toHaveBeenCalled();
  });

  test("TC-RS-003: PDF with missing text returns empty string", async () => {
    pdfParse.mockResolvedValue({});

    const result = await extractResumeText(
      Buffer.from("fake pdf")
    );

    expect(result).toBe("");
  });

  test("TC-RS-004: PDF parsing error returns empty string", async () => {
    pdfParse.mockRejectedValue(new Error("Invalid PDF"));

    const result = await extractResumeText(
      Buffer.from("bad pdf")
    );

    expect(result).toBe("");
  });
});