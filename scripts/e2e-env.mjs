// e2e 실행 환경변수 해석. playwright.config.ts와 단위 테스트가 함께 쓴다.

/**
 * 이미 떠 있는 preview 서버를 재사용할지 정한다.
 *
 * R43/R48: 기본은 항상 새로 빌드·기동이다. 4173에 남은 preview가 낡은 dist/를
 * 내보내면 게이트가 헛통과하기 때문이다. 재사용은 센티널 '1'로만 켠다 —
 * truthy 검사로는 PW_REUSE_SERVER=false·0·오타까지 "켬"으로 읽힌다.
 */
export function shouldReuseServer(env = {}) {
  return env.PW_REUSE_SERVER === '1';
}
