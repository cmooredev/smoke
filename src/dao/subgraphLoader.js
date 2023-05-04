// subgraph.js
import { fetchGraphQL } from "../lib/utils";
import { getENSName } from "../lib/ens";

export async function getProposals(subgraphUrl, daoInfo, latestProposalsFunc) {
  const latestProposals = await latestProposalsFunc();
  const proposals = await Promise.all(
    latestProposals.map(async (proposal) => {
      const delegate = await getDelegateById(subgraphUrl, proposal.proposer.id, daoInfo);

      const dao = delegate.daos[0];

      const votesFor = proposal.votes
        .filter((vote) => vote.support)
        .reduce((acc, vote) => acc + parseInt(vote.votes), 0);
      const votesAgainst = proposal.votes
        .filter((vote) => !vote.support)
        .reduce((acc, vote) => acc + parseInt(vote.votes), 0);
      console.log(`Proposal ${proposal.id} has ${votesFor} votes for and ${votesAgainst} votes against`);
      return {
        ...proposal,
        dao: dao,
        startDate: proposal.startDate,
        endDate: proposal.endBlock,
        id: proposal.id,
        votesFor: votesFor,
        votesAgainst: votesAgainst,
        votes: proposal.votes, // add this line to retain individual vote details
      };
    })
  );

  return proposals;
}

export async function getDelegateById(subgraphUrl, id, daoInfo) {
  const delegateQuery = `
    {
      delegate(id: "${id}") {
        id
        delegatedVotesRaw
        delegatedVotes
        tokenHoldersRepresentedAmount
      }
    }
    `;

  const delegateData = await fetchGraphQL(subgraphUrl, delegateQuery);

  if (delegateData && delegateData.errors) {
    console.error("GraphQL Errors:", delegateData.errors);
    return null;
  }

  const delegate = delegateData.data.delegate;
  const ensName = await getENSName(delegate.id); // Pass the delegate's Ethereum address to the getENSName function

  return {
    id: delegate.id,
    ensName: ensName,
    delegatedVotes: delegate.delegatedVotes,
    daos: [daoInfo], // Add the daos field here
  };
}

export async function getLatestProposals(subgraphUrl, daoInfo, limit = 10) {
  const latestProposalsQuery = `
    {
      proposals(first: ${limit}, orderBy: startBlock, orderDirection: desc) {
        id
        description
        startBlock
        endBlock
        status
        proposer {
          id
        }
        votes {
          id
          support
          votes
        }
      }
    }
  `;
  const latestProposalsData = await fetchGraphQL(subgraphUrl, latestProposalsQuery);
  if (latestProposalsData && latestProposalsData.errors) {
    console.error("GraphQL Errors:", latestProposalsData.errors);
    return [];
  }

  const proposals = latestProposalsData.data.proposals.map((proposal) => ({
    ...proposal,
    startDate: proposal.startBlock.toString(), // Add this line to create the startDate property
    dao: daoInfo,
  }));

  return proposals;
}

export async function getTopDelegates(subgraphUrl, daoInfo) {
  const delegatesQuery = `
    {
      delegates(first: 10, orderDirection: desc, orderBy: delegatedVotes) {
        id
        delegatedVotesRaw
        delegatedVotes
        tokenHoldersRepresentedAmount
    }
}
`;

const delegatesData = await fetchGraphQL(subgraphUrl, delegatesQuery);

if (delegatesData && delegatesData.errors) {
    console.error("GraphQL Errors:", delegatesData.errors);
    console.log(JSON.stringify(delegatesData.errors, null, 2)); // Add this line to display more error details
    return [];
  }

const delegates = delegatesData.data.delegates;

const delegatesWithProposals = await Promise.all(
delegates.map(async (delegate) => {
  const delegateId = delegate.id;

  const submittedProposalsQuery = `
    {
      proposals(where: {proposer: "${delegateId}"}, first: 10) {
        id
        description
        startBlock
        endBlock
        status
        proposer {
          id
        }
        votes {
          id
          support
          votes
        }
      }
    }
    `;

  const votedProposalsQuery = `
    {
      votes(first: 10, where: {voter: "${delegateId}"}) {
        id
        support
        votes
        proposal {
          id
          startBlock
          endBlock
          status
          description
        }
      }
    }
    `;

  const submittedProposalsData = await fetchGraphQL(subgraphUrl, submittedProposalsQuery);
  const votedProposalsData = await fetchGraphQL(subgraphUrl, votedProposalsQuery);

  if (votedProposalsData && votedProposalsData.errors) {
    console.error("GraphQL Errors:", votedProposalsData.errors);
    return [];
  }

  // Extract and format voting history for each proposal
  const votingHistory = [];
  votedProposalsData.data.votes.forEach((vote) => {
    const startDateTimestamp = vote.proposal.startBlock;
    const endDateTimestamp = vote.proposal.endBlock;
    const startDate = new Date(startDateTimestamp);
    const endDate = new Date(endDateTimestamp);
    votingHistory.push({
      proposalDescription: vote.proposal.description,
      protocol: daoInfo.name,
      howTheyVoted: vote.support ? "FOR" : "AGAINST",
      numberOfVotesCast: vote.votes,
      proposalId: vote.proposal.id,
      startDate: startDate,
      endDate: endDate,
      status: vote.proposal.status,
      url: `${daoInfo.url}/governance/${vote.proposal.id}`,
    });
  });

  const submittedProposals = [];
  submittedProposalsData.data.proposals.forEach((proposal) => {
    const startDateTimestamp = proposal.startBlock;
    const endDateTimestamp = proposal.endBlock;
    const startDate = startDateTimestamp.toString();
    const endDate = endDateTimestamp.toString();

    const votesFor = proposal.votes.filter((vote) => vote.support).reduce((acc, vote) => acc + parseInt(vote.votes), 0);
    const votesAgainst = proposal.votes.filter((vote) => !vote.support).reduce((acc, vote) => acc + parseInt(vote.votes), 0);

    const approved = votesFor > votesAgainst;
    submittedProposals.push({
      proposalId: proposal.id,
      description: proposal.description,
      startDate: startDate,
      endDate: endDate,
      status: proposal.status,
      url: `${daoInfo.url}/governance/${proposal.id}`,
      votesFor: votesFor,
      votesAgainst: votesAgainst,
      approved: approved,
    });
  });

  const ensName = await getENSName(delegate.id); // Pass the delegate's Ethereum address to the getENSName function

  return {
    id: delegate.id,
    ensName: ensName,
    delegatedVotes: delegate.delegatedVotes,
    votingHistory: votingHistory,
    proposals: submittedProposals,
    daos: [daoInfo],
};
})
);

return delegatesWithProposals;
}