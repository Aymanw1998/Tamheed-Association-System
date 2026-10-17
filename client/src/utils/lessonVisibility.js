// "My lessons" filter. Holders of lessons.viewAll always see every lesson;
// this only narrows what the page shows, the server decides what is allowed.
export const isLessonVisible = (lesson, { showMyLessons, canViewAll, uid }) => {
  if (!showMyLessons || canViewAll) return true;
  return (
    String(lesson?.teacher) === String(uid) ||
    (lesson?.list_students || []).map(String).includes(String(uid))
  );
};
