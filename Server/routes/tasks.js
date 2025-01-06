const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// DB 연결 설정
const connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '1234',
    database: 'project',
});


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


// Task 생성
router.post('/create', async (req, res) => {
    const { projectId, sprintId, taskName, description, assignedTo, status = 1, priority = '중간', dueDate } = req.body;

    if (!projectId || !taskName) {
        return res.status(400).json({ message: '프로젝트 ID와 작업 이름은 필수입니다.' });
    }

    try {
        // assignedTo가 있는 경우 사용자 확인
        if (assignedTo) {
            const [user] = await connection.promise().query(
                `SELECT user_idx FROM Users WHERE user_idx = ?`,
                [assignedTo]
            );

            if (user.length === 0) {
                return res.status(404).json({ message: '존재하지 않는 사용자입니다.' });
            }
        }

        // 작업 생성
        const [result] = await connection.promise().query(
            `INSERT INTO Tasks (project_id, sprint_id, task_name, description, assigned_to, Tasks_status_id, priority, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, sprintId || null, taskName, description || null, assignedTo || null, status, priority, dueDate || null]
        );

        res.status(201).json({
            message: '작업(Task)이 성공적으로 생성되었습니다.',
            taskId: result.insertId,
        });
    } catch (err) {
        console.error('작업 생성 오류:', err);
        res.status(500).json({ message: '작업 생성 중 오류가 발생했습니다.' });
    }
});


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


// Task 조회 (리스트)
router.get('/list', async (req, res) => {
    const { sprintId, projectId } = req.query;

    if (!projectId) {
        return res.status(400).json({ message: '프로젝트 ID는 필수입니다.' });
    }

    try {
        const query = `
            SELECT t.task_id AS taskId, t.task_name AS taskName, t.description, t.Tasks_status_id AS statusId,
                   s.Tasks_status_name AS statusName, t.priority, t.due_date AS dueDate, u.user_name AS assignedTo
            FROM Tasks t
            LEFT JOIN Tasks_status s ON t.Tasks_status_id = s.Tasks_status_id
            LEFT JOIN Users u ON t.assigned_to = u.user_idx
            WHERE t.project_id = ? ${sprintId ? 'AND t.sprint_id = ?' : ''}
            ORDER BY t.priority DESC, t.due_date ASC;
        `;

        const params = sprintId ? [projectId, sprintId] : [projectId];
        const [tasks] = await connection.promise().query(query, params);

        res.status(200).json(tasks);
    } catch (err) {
        console.error('작업 조회 오류:', err);
        res.status(500).json({ message: '작업 조회 중 오류가 발생했습니다.' });
    }
});


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


// Task 수정
router.put('/update', async (req, res) => {
    const { taskId, taskName, description, assignedTo, status, priority, dueDate, changedBy } = req.body;

    if (!taskId || !taskName || !changedBy) {
        return res.status(400).json({ message: '작업 ID, 이름, 변경자 ID는 필수입니다.' });
    }

    try {
        // 이전 데이터 가져오기
        const [oldTask] = await connection.promise().query(
            `SELECT * FROM Tasks WHERE task_id = ?`,
            [taskId]
        );

        if (oldTask.length === 0) {
            return res.status(404).json({ message: '수정할 작업을 찾을 수 없습니다.' });
        }

        const oldData = oldTask[0];

        // 작업 업데이트
        const [updateResult] = await connection.promise().query(
            `UPDATE Tasks
             SET task_name = ?, description = ?, assigned_to = ?, Tasks_status_id = ?, priority = ?, due_date = ?, last_updated_by = ?
             WHERE task_id = ?`,
            [taskName, description || null, assignedTo || null, status, priority, dueDate || null, changedBy, taskId]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({ message: '작업 업데이트에 실패했습니다.' });
        }

        // 변경 이력 삽입 데이터 생성
        const historyEntries = [];

        if (oldData.Tasks_status_id !== status) {
            historyEntries.push(['status', oldData.Tasks_status_id, status, changedBy]);
        }

        if (oldData.assigned_to !== assignedTo) {
            historyEntries.push(['assigned_to', oldData.assigned_to, assignedTo, changedBy]);
        }

        if (oldData.due_date !== dueDate) {
            historyEntries.push(['due_date', oldData.due_date, dueDate, changedBy]);
        }

        // Task_History 테이블에 기록
        for (const [changedField, oldValue, newValue, changedBy] of historyEntries) {
            await connection.promise().query(
                `INSERT INTO Task_History (task_id, changed_field, old_value, new_value, changed_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [taskId, changedField, oldValue || null, newValue || null, changedBy]
            );
        }

        res.status(200).json({ message: '작업(Task)이 성공적으로 수정되었고 변경 이력이 기록되었습니다.' });
    } catch (err) {
        console.error('작업 수정 오류:', err);
        res.status(500).json({ message: '작업 수정 중 오류가 발생했습니다.' });
    }
});


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Task 삭제
router.delete('/delete', async (req, res) => {
    const { taskId } = req.body;

    if (!taskId) {
        return res.status(400).json({ message: '작업 ID는 필수입니다.' });
    }

    try {
        const [result] = await connection.promise().query(
            `DELETE FROM Tasks WHERE task_id = ?`,
            [taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '삭제할 작업을 찾을 수 없습니다.' });
        }

        res.status(200).json({ message: '작업(Task)이 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('작업 삭제 오류:', err);
        res.status(500).json({ message: '작업 삭제 중 오류가 발생했습니다.' });
    }
});


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────



module.exports = router;
