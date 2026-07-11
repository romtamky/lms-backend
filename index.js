const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Kiểm tra Server
app.get("/", (req, res) => {
  res.send("Xin chào! Server LMS Đa Ngôn Ngữ đang hoạt động ngon lành!");
});

// ==================================================
// TÍNH NĂNG MỚI: QUẢN LÝ NGÔN NGỮ (KHÓA HỌC)
// ==================================================

app.get("/api/languages", async (req, res) => {
  try {
    const languages = await prisma.language.findMany();
    res.json({ success: true, data: languages });
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy danh sách khóa học!" });
  }
});

app.post("/api/admin/languages", async (req, res) => {
  const { name, code, imageUrl } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: "Vui lòng nhập tên và mã ngôn ngữ!" });
  }
  try {
    const newLang = await prisma.language.create({
      data: { name, code, imageUrl },
    });
    res.json({
      success: true,
      message: "Thêm khóa học thành công!",
      data: newLang,
    });
  } catch (error) {
    res.status(500).json({ error: "Lỗi khi thêm khóa học mới!" });
  }
});

// --------------------------------------------------
// API 1: ĐĂNG KÝ TÀI KHOẢN MỚI
// --------------------------------------------------
app.post("/api/register", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res
      .status(400)
      .json({ error: "Vui lòng nhập đủ số điện thoại và mật khẩu!" });
  }
  try {
    const existingUser = await prisma.user.findUnique({
      where: { phone: phone },
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "🚨 Số điện thoại này đã được đăng ký!" });
    }
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");
    const newUser = await prisma.user.create({
      data: { phone: phone, password: hashedPassword },
    });
    console.log("🎉 Đã đăng ký tài khoản mới:", newUser.phone);
    res.json({ success: true, message: "Đăng ký thành công!", data: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi hệ thống đăng ký!" });
  }
});

// --------------------------------------------------
// API 2: ĐĂNG NHẬP VÀO HỆ THỐNG
// --------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res
      .status(400)
      .json({ error: "Vui lòng nhập đủ số điện thoại và mật khẩu!" });
  }
  try {
    const user = await prisma.user.findUnique({ where: { phone: phone } });
    if (!user) {
      return res
        .status(404)
        .json({ error: "🚨 Số điện thoại chưa được đăng ký!" });
    }
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");
    if (user.password !== hashedPassword) {
      return res
        .status(401)
        .json({ error: "🔒 Sai mật khẩu! Vui lòng thử lại." });
    }
    console.log("👋 Người dùng đăng nhập thành công:", user.phone);
    res.json({ success: true, message: "Đăng nhập thành công", data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi hệ thống đăng nhập!" });
  }
});

// --------------------------------------------------
// API 3: LẤY DANH SÁCH BÀI HỌC THEO NGÔN NGỮ
// --------------------------------------------------
app.get("/api/courses/progress", async (req, res) => {
  const userId = parseInt(req.query.userId);
  const languageId = req.query.languageId
    ? parseInt(req.query.languageId)
    : null;

  if (!userId) return res.status(400).json({ error: "Thiếu userId" });

  try {
    const whereCondition = languageId ? { languageId: languageId } : {};

    const lessons = await prisma.lesson.findMany({
      where: whereCondition,
      orderBy: { orderIndex: "asc" },
    });

    const progresses = await prisma.userProgress.findMany({
      where: { userId: userId },
    });

    let isNextUnlocked = true;

    const lessonList = lessons.map((lesson) => {
      const userProg = progresses.find((p) => p.lessonId === lesson.id);
      const isPassed = userProg ? userProg.isQuizPassed : false;
      let status = "locked";

      if (isPassed) {
        status = "completed";
        isNextUnlocked = true;
      } else if (isNextUnlocked) {
        status = "unlocked";
        isNextUnlocked = false;
      }

      return {
        id: lesson.id,
        title: lesson.title,
        orderIndex: lesson.orderIndex,
        status: status,
      };
    });

    res.json({ success: true, data: lessonList });
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy danh sách khóa học!" });
  }
});

// --------------------------------------------------
// API 4: LẤY CHI TIẾT BÀI HỌC VÀ CÂU HỎI
// --------------------------------------------------
app.get("/api/lessons/:id", async (req, res) => {
  const lessonId = parseInt(req.params.id);
  const userId = parseInt(req.query.userId);

  if (!userId)
    return res.status(400).json({ error: "Thiếu thông tin người dùng!" });

  try {
    const currentLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!currentLesson)
      return res.status(404).json({ error: "Không tìm thấy bài học này!" });

    if (currentLesson.orderIndex > 1) {
      const prevLesson = await prisma.lesson.findFirst({
        where: {
          orderIndex: currentLesson.orderIndex - 1,
          languageId: currentLesson.languageId,
        },
      });
      if (prevLesson) {
        const prevProgress = await prisma.userProgress.findFirst({
          where: { userId: userId, lessonId: prevLesson.id },
        });
        if (!prevProgress || !prevProgress.isQuizPassed) {
          return res.status(403).json({
            error: "LOCKED",
            message:
              "🔒 Bạn phải hoàn thành trọn vẹn bài trước mới được mở khóa bài này!",
          });
        }
      }
    }

    const lessonData = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        questions: {
          select: {
            id: true,
            content: true,
            optionA: true,
            optionB: true,
            optionC: true,
            optionD: true,
          },
        },
      },
    });
    res.json({ success: true, data: lessonData });
  } catch (error) {
    res.status(500).json({ error: "Lỗi hệ thống!" });
  }
});

// --------------------------------------------------
// API 5 & API 6: LƯU TIẾN ĐỘ & NỘP BÀI
// --------------------------------------------------
app.post("/api/progress/ping", async (req, res) => {
  const { userId, lessonId, currentTime, isEnded } = req.body;
  if (!userId || !lessonId)
    return res.status(400).json({ error: "Thiếu thông tin!" });
  try {
    let progress = await prisma.userProgress.findFirst({
      where: { userId: userId, lessonId: lessonId },
    });
    if (!progress) {
      progress = await prisma.userProgress.create({
        data: { userId: userId, lessonId: lessonId, maxWatchTime: 0 },
      });
    }
    const newMaxTime = Math.max(progress.maxWatchTime, currentTime);
    await prisma.userProgress.update({
      where: { id: progress.id },
      data: {
        maxWatchTime: newMaxTime,
        isVideoDone: isEnded ? true : progress.isVideoDone,
      },
    });
    res.json({ success: true, maxWatchTime: newMaxTime });
  } catch (error) {
    res.status(500).json({ error: "Lỗi cập nhật tiến độ!" });
  }
});

app.post("/api/quiz/submit", async (req, res) => {
  const { userId, lessonId, userAnswers } = req.body;
  if (!userId || !lessonId || !userAnswers)
    return res.status(400).json({ error: "Thiếu thông tin nộp bài!" });
  
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(lessonId) },
      include: { questions: true },
    });
    
    // 🛠️ ĐÃ CẬP NHẬT: Lấy toàn bộ số lượng câu hỏi thực tế (không giới hạn 10 câu nữa)
    const totalQuestionsInExam = lesson.questions.length;
    
    // Lưu ý: Đã xóa phần báo lỗi nếu thiếu câu trả lời. 
    // Lý do: Nếu người dùng hết 20s không kịp click, mảng userAnswers sẽ bị thiếu câu đó, 
    // và hệ thống vẫn tiến hành chấm (câu thiếu xem như sai).

    let correctCount = 0;
    userAnswers.forEach((userAns) => {
      const originalQuestion = lesson.questions.find(
        (q) => q.id === userAns.questionId,
      );
      if (
        originalQuestion &&
        originalQuestion.correctAnswer === userAns.answer
      ) {
        correctCount++;
      }
    });

    // 🛠️ ĐÃ CẬP NHẬT: Phải đúng 100% số câu hỏi mới qua bài
    const passThreshold = totalQuestionsInExam;
    const isPassed = correctCount >= passThreshold && totalQuestionsInExam > 0;

    if (isPassed) {
      const existingProgress = await prisma.userProgress.findFirst({
        where: { userId: parseInt(userId), lessonId: parseInt(lessonId) },
      });
      if (existingProgress) {
        await prisma.userProgress.update({
          where: { id: existingProgress.id },
          data: { isQuizPassed: true },
        });
      } else {
        await prisma.userProgress.create({
          data: {
            userId: parseInt(userId),
            lessonId: parseInt(lessonId),
            maxWatchTime: 0,
            isQuizPassed: true,
          },
        });
      }
      return res.json({
        passed: true,
        message: `🎉 Chúc mừng! Bạn đúng ${correctCount}/${totalQuestionsInExam} câu (100%). Đã đủ điều kiện qua bài!`,
      });
    } else {
      return res.json({
        passed: false,
        message: `❌ Bạn chỉ đúng ${correctCount}/${totalQuestionsInExam} câu. Cần đúng 100% để qua bài. Vui lòng thử lại!`,
      });
    }
  } catch (error) {
    console.error("Lỗi nộp bài:", error);
    res.status(500).json({ error: "Lỗi chấm điểm!" });
  }
});

// ==================================================
// KHU VỰC DÀNH RIÊNG CHO QUẢN TRỊ VIÊN (ADMIN)
// ==================================================

app.get("/api/admin/lessons", async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      include: { questions: true, language: true },
      orderBy: [
        { languageId: "asc" },
        { orderIndex: "asc" },
      ],
    });
    res.json({ data: lessons });
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy danh sách bài học!" });
  }
});

app.post("/api/admin/lessons", async (req, res) => {
  const { title, videoUrl, orderIndex, languageId, questions } = req.body;

  if (
    !title ||
    !videoUrl ||
    !orderIndex ||
    !questions ||
    questions.length === 0
  ) {
    return res
      .status(400)
      .json({
        error: "Vui lòng điền đầy đủ thông tin bài học và ít nhất 1 câu hỏi!",
      });
  }

  try {
    const newLesson = await prisma.lesson.create({
      data: {
        title: title,
        videoUrl: videoUrl,
        orderIndex: parseInt(orderIndex),
        languageId: languageId ? parseInt(languageId) : null,
        questions: {
          create: questions.map((q) => ({
            content: q.content,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
          })),
        },
      },
    });
    res.json({
      success: true,
      message: "🎉 Đã thêm bài học mới thành công!",
      data: newLesson,
    });
  } catch (error) {
    console.error("LỖI:", error);
    res.status(500).json({ error: "Lỗi Database: Không thể lưu bài học!" });
  }
});

app.put("/api/admin/lessons/:id", async (req, res) => {
  const { id } = req.params;
  const { title, videoUrl, orderIndex, languageId, questions } = req.body;

  try {
    await prisma.question.deleteMany({ where: { lessonId: parseInt(id) } });

    await prisma.lesson.update({
      where: { id: parseInt(id) },
      data: {
        title,
        videoUrl,
        orderIndex: parseInt(orderIndex),
        languageId: languageId ? parseInt(languageId) : null,
        questions: {
          create: questions.map((q) => ({
            content: q.content,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
          })),
        },
      },
    });
    res.json({ message: "🎉 Cập nhật bài học thành công!" });
  } catch (error) {
    res.status(500).json({ error: "Lỗi khi cập nhật bài học!" });
  }
});

// --------------------------------------------------
// LỆNH KHỞI ĐỘNG SERVER (DUY NHẤT Ở CUỐI FILE)
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});
