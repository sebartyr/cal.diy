import { describe, expect, it } from "vitest";
import { addMissingTeamMembersAsHosts } from "./addMissingTeamMembersAsHosts";

type TestHost = { userId: number; isFixed: boolean; priority: number };

const buildHost = (userId: number): TestHost => ({ userId, isFixed: true, priority: 2 });

describe("addMissingTeamMembersAsHosts", () => {
  it("creates a host for every team member when there are none", () => {
    expect(addMissingTeamMembersAsHosts({ hosts: [], teamMemberIds: [20, 60], buildHost })).toEqual([
      { userId: 20, isFixed: true, priority: 2 },
      { userId: 60, isFixed: true, priority: 2 },
    ]);
  });

  it("keeps the settings of hosts that already exist", () => {
    const hosts: TestHost[] = [{ userId: 20, isFixed: false, priority: 4 }];

    expect(addMissingTeamMembersAsHosts({ hosts, teamMemberIds: [20, 60], buildHost })).toEqual([
      { userId: 20, isFixed: false, priority: 4 },
      { userId: 60, isFixed: true, priority: 2 },
    ]);
  });

  it("returns the hosts unchanged when every member is already a host", () => {
    const hosts: TestHost[] = [
      { userId: 20, isFixed: true, priority: 2 },
      { userId: 60, isFixed: true, priority: 3 },
    ];

    expect(addMissingTeamMembersAsHosts({ hosts, teamMemberIds: [60, 20], buildHost })).toEqual(hosts);
  });

  it("does not remove hosts that are not in the member list", () => {
    const hosts: TestHost[] = [{ userId: 99, isFixed: true, priority: 2 }];

    expect(addMissingTeamMembersAsHosts({ hosts, teamMemberIds: [], buildHost })).toEqual(hosts);
  });
});
